import os

from django.db.models import Q
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from diagnostics.models import PredictionResult
from diagnostics.views import ensure_session_key
from .models import LlmDiagnosisResult
from .serializers import LlmDiagnosisResultSerializer
from .utils import generate_diagnosis_from_prediction


class GenerateLlmDiagnosisAPIView(APIView):
    def post(self, request, *args, **kwargs):
        # Cost gate: when AI_PASSPHRASE is set, callers must submit the same value
        # so the OpenAI quota is not consumed by anonymous demo visitors.
        expected_passphrase = os.getenv('AI_PASSPHRASE', '').strip()
        if expected_passphrase:
            provided = str(request.data.get('passphrase', '')).strip()
            if provided != expected_passphrase:
                return Response(
                    {'error': '올바른 키를 입력해 주세요.'},
                    status=status.HTTP_403_FORBIDDEN,
                )

        prediction_id = request.data.get('prediction_id')
        if not prediction_id:
            return Response({'error': 'Prediction ID is required'}, status=status.HTTP_400_BAD_REQUEST)

        session_key = ensure_session_key(request)
        prediction_query = Q(id=prediction_id, session_key=session_key)
        if request.user.is_authenticated:
            prediction_query |= Q(id=prediction_id, user=request.user)

        prediction = PredictionResult.objects.filter(prediction_query).first()
        if not prediction:
            return Response({'error': 'Prediction not found'}, status=status.HTTP_404_NOT_FOUND)

        diagnosis_query = Q(prediction=prediction, session_key=session_key)
        if request.user.is_authenticated:
            diagnosis_query |= Q(prediction=prediction, user=request.user)
        existing_diagnosis = LlmDiagnosisResult.objects.filter(diagnosis_query).first()

        if existing_diagnosis:
            serializer = LlmDiagnosisResultSerializer(existing_diagnosis)
            return Response(serializer.data, status=status.HTTP_200_OK)

        diagnosis_text = generate_diagnosis_from_prediction(prediction)
        if not diagnosis_text:
            return Response({'error': 'Failed to generate diagnosis'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        diagnosis = LlmDiagnosisResult.objects.create(
            user=request.user if request.user.is_authenticated else None,
            session_key=session_key,
            prediction=prediction,
            diagnosis_text=diagnosis_text
        )

        serializer = LlmDiagnosisResultSerializer(diagnosis)
        return Response(serializer.data, status=status.HTTP_201_CREATED)
