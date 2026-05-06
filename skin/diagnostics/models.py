from django.db import models
from accounts.models import CustomUser

class PredictionResult(models.Model):
    user = models.ForeignKey(CustomUser, on_delete=models.CASCADE, null=True, blank=True)
    session_key = models.CharField(max_length=40, db_index=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    # 이마 색소침착 예측
    forehead_pigmentation_prediction = models.IntegerField(null=True, blank=True)
    forehead_pigmentation_probabilities = models.JSONField(null=True, blank=True)

    # 왼쪽 볼 모공 예측
    left_cheek_pore_prediction = models.IntegerField(null=True, blank=True)
    left_cheek_pore_probabilities = models.JSONField(null=True, blank=True)

    # 오른쪽 볼 모공 예측
    right_cheek_pore_prediction = models.IntegerField(null=True, blank=True)
    right_cheek_pore_probabilities = models.JSONField(null=True, blank=True)

    # 피부 타입 예측 (왼쪽 볼과 오른쪽 볼의 평균)
    skin_type_prediction = models.IntegerField(null=True, blank=True)
    skin_type_probabilities = models.JSONField(null=True, blank=True)

    # 이마 수분 예측
    forehead_moisture_prediction = models.IntegerField(null=True, blank=True)
    forehead_moisture_probabilities = models.JSONField(null=True, blank=True)

    # 왼쪽 볼 수분 예측
    left_cheek_moisture_prediction = models.IntegerField(null=True, blank=True)
    left_cheek_moisture_probabilities = models.JSONField(null=True, blank=True)

    # 오른쪽 볼 수분 예측
    right_cheek_moisture_prediction = models.IntegerField(null=True, blank=True)
    right_cheek_moisture_probabilities = models.JSONField(null=True, blank=True)

    # 입술 건조도 예측
    lips_dryness_prediction = models.IntegerField(null=True, blank=True)
    lips_dryness_probabilities = models.JSONField(null=True, blank=True)

    marked_image_url = models.CharField(max_length=500, null=True, blank=True)

    def __str__(self):
        owner = self.user_id or self.session_key or "anonymous"
        return f"Prediction for {owner} on {self.created_at}"
