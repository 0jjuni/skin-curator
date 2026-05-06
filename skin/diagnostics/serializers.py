from rest_framework import serializers


class PredictionSerializer(serializers.Serializer):
    # Primary Key는 조건적으로 추가할 예정
    id = serializers.IntegerField(read_only=True, required=False)

    # 생성 일시 (read-only)
    created_at = serializers.DateTimeField(read_only=True)

    # 이마 색소침착 예측
    forehead_pigmentation_prediction = serializers.IntegerField()
    forehead_pigmentation_probabilities = serializers.ListField(
        child=serializers.FloatField(),
        allow_empty=False
    )

    # 왼쪽 볼 모공 예측
    left_cheek_pore_prediction = serializers.IntegerField()
    left_cheek_pore_probabilities = serializers.ListField(
        child=serializers.FloatField(),
        allow_empty=False
    )

    # 오른쪽 볼 모공 예측
    right_cheek_pore_prediction = serializers.IntegerField()
    right_cheek_pore_probabilities = serializers.ListField(
        child=serializers.FloatField(),
        allow_empty=False
    )

    # 피부 타입 예측 (왼쪽 볼, 오른쪽 볼 평균)
    skin_type_prediction = serializers.IntegerField()
    skin_type_probabilities = serializers.ListField(
        child=serializers.FloatField(),
        allow_empty=False
    )

    # 이마 수분 예측
    forehead_moisture_prediction = serializers.IntegerField()
    forehead_moisture_probabilities = serializers.ListField(
        child=serializers.FloatField(),
        allow_empty=False
    )

    # 왼쪽 볼 수분 예측
    left_cheek_moisture_prediction = serializers.IntegerField()
    left_cheek_moisture_probabilities = serializers.ListField(
        child=serializers.FloatField(),
        allow_empty=False
    )

    # 오른쪽 볼 수분 예측
    right_cheek_moisture_prediction = serializers.IntegerField()
    right_cheek_moisture_probabilities = serializers.ListField(
        child=serializers.FloatField(),
        allow_empty=False
    )

    # 입술 건조도 예측
    lips_dryness_prediction = serializers.IntegerField()
    lips_dryness_probabilities = serializers.ListField(
        child=serializers.FloatField(),
        allow_empty=False
    )

    # 얼굴 좌표가 표시된 이미지 URL (로그인 여부와 관계없이 항상 포함)
    marked_image_url = serializers.CharField(max_length=500, required=False, allow_blank=True)
