import numpy as np
from django.db.models import Q
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.generics import ListCreateAPIView, RetrieveUpdateDestroyAPIView
from rest_framework.response import Response
from rest_framework.views import APIView
from sklearn.metrics.pairwise import cosine_similarity

from diagnostics.models import PredictionResult
from diagnostics.views import ensure_session_key
from .models import ProductFeature, ProductInfo, Survey
from .serializers import ProductInfoSerializer, SurveySerializer


VECTOR_FIELDS = [
    "oily",
    "dry",
    "normal",
    "combination",
    "sensitive",
    "acne",
    "atopy",
    "teens",
    "twenties",
    "thirties",
    "forties_above",
    "moisture_supply",
    "pore_care",
    "pigmentation_care",
    "lip_dry_care",
]

FIELD_LABELS = {
    "oily": "지성 피부",
    "dry": "건성 피부",
    "normal": "중성 피부",
    "combination": "복합성 피부",
    "sensitive": "민감도",
    "acne": "트러블",
    "atopy": "아토피 민감도",
    "teens": "10대",
    "twenties": "20대",
    "thirties": "30대",
    "forties_above": "40대 이상",
    "moisture_supply": "수분/보습",
    "pore_care": "모공 케어",
    "pigmentation_care": "색소 케어",
    "lip_dry_care": "건조 케어",
}

FIELD_WEIGHTS = {
    "oily": 1.7,
    "dry": 1.7,
    "normal": 1.5,
    "combination": 1.2,
    "sensitive": 1.25,
    "acne": 1.25,
    "atopy": 1.1,
    "teens": 0.75,
    "twenties": 0.75,
    "thirties": 0.75,
    "forties_above": 0.75,
    "moisture_supply": 1.45,
    "pore_care": 1.35,
    "pigmentation_care": 1.25,
    "lip_dry_care": 1.05,
}


class SurveyListCreateView(ListCreateAPIView):
    serializer_class = SurveySerializer

    def get_queryset(self):
        if self.request.user.is_authenticated:
            return Survey.objects.filter(user=str(self.request.user.id))
        return Survey.objects.none()

    def perform_create(self, serializer):
        if self.request.user.is_authenticated:
            if Survey.objects.filter(user=str(self.request.user.id)).exists():
                raise ValidationError("이미 설문조사를 생성했습니다.")
            serializer.save(user=str(self.request.user.id))
            return

        survey = serializer.save()
        survey.user = str(survey.id)
        survey.save(update_fields=["user"])


class SurveyRetrieveUpdateDestroyView(RetrieveUpdateDestroyAPIView):
    serializer_class = SurveySerializer

    def get_object(self):
        user_id = self.kwargs["user_id"]
        obj = Survey.objects.filter(user=user_id).first()

        if obj is None:
            raise PermissionDenied("해당 설문조사를 찾을 수 없거나 접근 권한이 없습니다.")

        if self.request.user.is_authenticated and str(self.request.user.id) != user_id:
            raise PermissionDenied("다른 사용자의 설문조사에는 접근할 수 없습니다.")

        return obj


class UserRecommendationView(APIView):
    def post(self, request):
        user = request.user if request.user.is_authenticated else None
        prediction_id = request.data.get("prediction_id")

        if not prediction_id:
            raise ValidationError("body: prediction_id가 없습니다.")

        session_key = ensure_session_key(request)
        prediction_query = Q(id=prediction_id, session_key=session_key)
        if user:
            prediction_query |= Q(id=prediction_id, user=user)

        prediction = PredictionResult.objects.filter(prediction_query).first()
        if not prediction:
            raise NotFound("해당 prediction_id의 예측 결과를 찾을 수 없습니다.")

        survey = self._get_survey(request, user)
        row_data = self._build_user_features(prediction, survey, user, request)
        products = ProductFeature.objects.all()
        if not products.exists():
            return Response({"recommended_data": []})

        product_vectors = []
        product_ids = []
        features_by_id = {}
        for product in products:
            product_vectors.append([getattr(product, field) for field in VECTOR_FIELDS])
            product_ids.append(product.id)
            features_by_id[product.id] = product

        weights = np.array([FIELD_WEIGHTS[field] for field in VECTOR_FIELDS])
        user_vector = np.array([float(row_data[field]) for field in VECTOR_FIELDS]).reshape(1, -1) * weights
        product_vectors = np.array(product_vectors) * weights
        similarities = cosine_similarity(user_vector, product_vectors).flatten()
        similarity_by_id = {
            product_ids[index]: float(similarities[index])
            for index in range(len(product_ids))
        }
        top_product_ids = [product_ids[i] for i in similarities.argsort()[::-1][:20]]

        products_by_id = ProductInfo.objects.in_bulk(top_product_ids)
        recommended_products = []
        for product_id in top_product_ids:
            product = products_by_id.get(product_id)
            feature = features_by_id.get(product_id)
            if not product or not feature:
                continue

            score = max(0.0, min(similarity_by_id[product_id], 1.0))
            product.match_score = round(score * 100)
            product.match_reasons = self._match_reasons(row_data, feature)
            recommended_products.append(product)

        recommended_data = ProductInfoSerializer(recommended_products, many=True).data

        return Response({"recommended_data": recommended_data})

    def _get_survey(self, request, user):
        if user:
            survey = Survey.objects.filter(user=user.id).first()
        else:
            survey_id = request.data.get("survey_id")
            if not survey_id:
                raise ValidationError("body: survey_id가 없습니다.")
            survey = Survey.objects.filter(user=survey_id).first()

        if not survey:
            raise NotFound("추천에 필요한 설문 결과가 없습니다.")
        return survey

    def _build_user_features(self, prediction, survey, user, request):
        moisture_values = [
            prediction.forehead_moisture_prediction,
            prediction.left_cheek_moisture_prediction,
            prediction.right_cheek_moisture_prediction,
        ]
        pore_values = [
            prediction.left_cheek_pore_prediction,
            prediction.right_cheek_pore_prediction,
        ]

        average_moisture = 1 - (sum(self._scale(value, 1) for value in moisture_values) / len(moisture_values))
        average_pore = sum(self._scale(value, 2) for value in pore_values) / len(pore_values)
        lip_dryness = self._scale(prediction.lips_dryness_prediction, 2)
        pigmentation = self._scale(prediction.forehead_pigmentation_prediction, 2)
        age_features = self._age_features(user, request.data.get("age_group"))

        return {
            "oily": 1 if prediction.skin_type_prediction == 2 else 0,
            "dry": 1 if prediction.skin_type_prediction == 0 else 0,
            "normal": 1 if prediction.skin_type_prediction == 1 else 0,
            "combination": 0,
            "sensitive": survey.sensitivity_level,
            "acne": survey.acne_level,
            "atopy": survey.atopy_level,
            **age_features,
            "moisture_supply": average_moisture,
            "pore_care": average_pore,
            "pigmentation_care": pigmentation,
            "lip_dry_care": lip_dryness,
        }

    def _scale(self, value, max_value):
        if value is None:
            return 0
        return max(0, min(float(value) / max_value, 1))

    def _age_features(self, user, requested_group):
        if user:
            age = getattr(user, "age", None)
            if age is not None:
                requested_group = (
                    "teens" if age < 20
                    else "twenties" if age < 30
                    else "thirties" if age < 40
                    else "forties_above"
                )

        return {
            "teens": 1 if requested_group == "teens" else 0,
            "twenties": 1 if requested_group == "twenties" else 0,
            "thirties": 1 if requested_group == "thirties" else 0,
            "forties_above": 1 if requested_group == "forties_above" else 0,
        }

    def _match_reasons(self, user_features, product_feature):
        contributions = []
        for field in VECTOR_FIELDS:
            user_value = float(user_features[field])
            product_value = float(getattr(product_feature, field))
            contribution = user_value * product_value * FIELD_WEIGHTS[field]
            if contribution > 0:
                contributions.append((contribution, FIELD_LABELS[field]))

        reasons = [label for _, label in sorted(contributions, reverse=True)[:3]]
        return reasons or ["피부 밸런스"]


# Backward-compatible alias for the existing URL import typo.
UserRecomendationView = UserRecommendationView
