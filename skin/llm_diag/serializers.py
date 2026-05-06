# llm_diag/serializers.py
from rest_framework import serializers
from .models import LlmDiagnosisResult

class LlmDiagnosisResultSerializer(serializers.ModelSerializer):
    class Meta:
        model = LlmDiagnosisResult
        fields = ['user', 'prediction', 'diagnosis_text', 'created_at']
