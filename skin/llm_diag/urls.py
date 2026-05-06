# llm_diag/urls.py
from django.urls import path
from .views import GenerateLlmDiagnosisAPIView

urlpatterns = [
    path('generate/', GenerateLlmDiagnosisAPIView.as_view(), name='generate_llm_diagnosis'),
]