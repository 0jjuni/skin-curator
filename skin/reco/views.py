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
        row_data = self._build_user_features(prediction, survey, user)
        products = ProductFeature.objects.all()
        if not products.exists():
            return Response({"recommended_data": []})

        product_vectors = []
        product_ids = []
        for product in products:
            product_vectors.append([
                product.oily,
                product.dry,
                product.normal,
                product.combination,
                product.sensitive,
                product.acne,
                product.atopy,
                product.teens,
                product.twenties,
                product.thirties,
                product.forties_above,
                product.moisture_supply,
                product.pore_care,
                product.pigmentation_care,
                product.lip_dry_care,
            ])
            product_ids.append(product.id)

        user_vector = np.array([float(value) for value in row_data.values()]).reshape(1, -1)
        similarities = cosine_similarity(user_vector, product_vectors).flatten()
        top_product_ids = [product_ids[i] for i in similarities.argsort()[::-1][:20]]

        products_by_id = ProductInfo.objects.in_bulk(top_product_ids)
        recommended_products = [
            products_by_id[product_id]
            for product_id in top_product_ids
            if product_id in products_by_id
        ]
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

    def _build_user_features(self, prediction, survey, user):
        moisture_values = [
            prediction.forehead_moisture_prediction,
            prediction.left_cheek_moisture_prediction,
            prediction.right_cheek_moisture_prediction,
        ]
        pore_values = [
            prediction.left_cheek_pore_prediction,
            prediction.right_cheek_pore_prediction,
        ]

        average_moisture = 1 - (sum(moisture_values) / len(moisture_values))
        average_pore = sum(pore_values) / len(pore_values)
        lip_dryness = prediction.lips_dryness_prediction / 2

        return {
            "oily": 1 if prediction.skin_type_prediction == 2 else 0,
            "dry": 1 if prediction.skin_type_prediction == 0 else 0,
            "normal": 1 if prediction.skin_type_prediction == 1 else 0,
            "combination": 0,
            "sensitive": survey.sensitivity_level,
            "acne": survey.acne_level,
            "atopy": survey.atopy_level,
            "teens": 1 if user and user.age < 20 else 0,
            "twenties": 1 if user and 20 <= user.age < 30 else 0,
            "thirties": 1 if user and 30 <= user.age < 40 else 0,
            "forties_above": 1 if user and user.age >= 40 else 0,
            "moisture_supply": average_moisture,
            "pore_care": average_pore,
            "pigmentation_care": prediction.forehead_pigmentation_prediction,
            "lip_dry_care": lip_dryness,
        }


# Backward-compatible alias for the existing URL import typo.
UserRecomendationView = UserRecommendationView
