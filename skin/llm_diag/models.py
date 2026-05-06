# llm_diag/models.py
from django.db import models
from accounts.models import CustomUser
from diagnostics.models import PredictionResult

class LlmDiagnosisResult(models.Model):
    user = models.ForeignKey(CustomUser, on_delete=models.CASCADE)
    prediction = models.ForeignKey(PredictionResult, on_delete=models.CASCADE)
    diagnosis_text = models.TextField()  # GPT로부터 받은 진단 내용
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Diagnosis for {self.user.id} on {self.created_at}"
