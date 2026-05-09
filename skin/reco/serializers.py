from rest_framework import serializers

from reco.models import ProductInfo
from reco.models import Survey


class SurveySerializer(serializers.ModelSerializer):
    class Meta:
        model = Survey
        fields = ['id', 'user', 'atopy_level', 'acne_level', 'sensitivity_level']
        read_only_fields = ['id', 'user']

    def validate_atopy_level(self, value):
        if value not in [1,2,3,4,5]:
            raise serializers.ValidationError('Atopy level must be 1,2,3,4,5(1~5사이값)')
        return value

    def validate_acne_level(self, value):
        if value not in [1,2,3,4,5]:
            raise serializers.ValidationError('Acne_level must be 1,2,3,4,5(1~5사이값)')
        return value

    def validate_sensitivity_level(self, value):
        if value not in [1,2,3,4,5]:
            raise serializers.ValidationError('Sensitivity_level must be 1,2,3,4,5(1~5사이값)')
        return value

    def create(self, validated_data):
        # 회원의 경우 User ID에 사용자 ID, 비회원의 경우 key값 그대로 유지
        request = self.context.get('request', None)
        if request and request.user.is_authenticated:
            # 회원일 경우
            validated_data['user'] = str(request.user.id)
            return Survey.objects.create(**validated_data)
        else:
            # 비회원일 경우
            survey = Survey.objects.create(**validated_data)
            survey.user = str(survey.id)  # 비회원의 경우 user에 pk를 저장
            survey.save()
            return survey


# 추천 시리얼라이져
# class CustomUserSerializer(serializers.ModelSerializer):
#     class Meta:
#         model = CustomUser
#         fields = ['id', 'name', 'age']
#
# class PredictSerializer(serializers.ModelSerializer):
#     class Meta:
#         model = PredictionResult
#         fields = [
#             'forehead_pigmentation_prediction',
#             'left_cheek_pore_prediction',
#             'skin_type_prediction',
#             'forehead_moisture_prediction',
#             'left_cheek_moisture_prediction',
#             'right_cheek_moisture_prediction',
#             'lips_dryness_prediction'
#         ]
#
# class SurveySerializer(serializers.ModelSerializer):
#     class Meta:
#         model = Survey
#         fields = ['id', 'user', 'atopy_level', 'acne_level', 'sensitivity_level']
#
# class ProductFeatureSerializer(serializers.ModelSerializer):
#     class Meta:
#         model = ProductFeature
#         fields = '__all__'
#
# class UserRecomendationSerializer(serializers.Serializer):
#     user = CustomUserSerializer()
#     prediction = PredictSerializer()
#     survey = SurveySerializer()
#     products = ProductFeatureSerializer(many=True)
#
#     def to_representation(self, instance):
#         return {
#             'user': CustomUserSerializer(instance['user']).data if instance.get('user') else None,
#             'prediction': PredictSerializer(instance['prediction']).data if instance.get('prediction') else None,
#             'survey': SurveySerializer(instance['survey']).data if instance.get('survey') else None,
#             'products': ProductFeatureSerializer(instance['products'], many=True).data if instance.get('products') else []
#         }

class ProductInfoSerializer(serializers.ModelSerializer):
    match_score = serializers.SerializerMethodField()
    match_reasons = serializers.SerializerMethodField()

    class Meta:
        model = ProductInfo
        fields = '__all__'

    def get_match_score(self, obj):
        return getattr(obj, "match_score", None)

    def get_match_reasons(self, obj):
        return getattr(obj, "match_reasons", [])
