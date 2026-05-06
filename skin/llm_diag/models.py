# llm_diag/models.py
from django.db import models
from accounts.models import CustomUser
from diagnostics.models import PredictionResult

class LlmDiagnosisResult(models.Model):
    user = models.ForeignKey(CustomUser, on_delete=models.CASCADE, null=True, blank=True)
    session_key = models.CharField(max_length=40, db_index=True, blank=True)
    prediction = models.ForeignKey(PredictionResult, on_delete=models.CASCADE)
    diagnosis_text = models.TextField()  # GPT로부터 받은 진단 내용
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        owner = self.user_id or self.session_key or "anonymous"
        return f"Diagnosis for {owner} on {self.created_at}"
