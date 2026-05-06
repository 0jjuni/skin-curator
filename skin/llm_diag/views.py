from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from diagnostics.models import PredictionResult
from .models import LlmDiagnosisResult
from .serializers import LlmDiagnosisResultSerializer
from .utils import generate_diagnosis_from_prediction


class GenerateLlmDiagnosisAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        prediction_id = request.data.get('prediction_id')
        if not prediction_id:
            return Response({'error': 'Prediction ID is required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            # PredictionResult가 현재 사용자에게 있는지 확인
            prediction = PredictionResult.objects.get(id=prediction_id, user=request.user)
        except PredictionResult.DoesNotExist:
            return Response({'error': 'Prediction not found'}, status=status.HTTP_404_NOT_FOUND)

        # 이미 해당 Prediction에 대한 진단이 존재하는지 확인
        existing_diagnosis = LlmDiagnosisResult.objects.filter(prediction=prediction, user=request.user).first()

        if existing_diagnosis:
            # 기존 진단 결과 반환
            serializer = LlmDiagnosisResultSerializer(existing_diagnosis)
            return Response(serializer.data, status=status.HTTP_200_OK)

        # OpenAI를 사용하여 새로운 진단 생성
        diagnosis_text = generate_diagnosis_from_prediction(prediction)
        if not diagnosis_text:
            return Response({'error': 'Failed to generate diagnosis'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        # 새로운 진단 결과 저장
        diagnosis = LlmDiagnosisResult.objects.create(
            user=request.user,
            prediction=prediction,
            diagnosis_text=diagnosis_text
        )

        serializer = LlmDiagnosisResultSerializer(diagnosis)
        return Response(serializer.data, status=status.HTTP_201_CREATED)
