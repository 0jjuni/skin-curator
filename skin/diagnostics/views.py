import logging

from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .ml import analyze_skin_image
from .models import PredictionResult
from .serializers import PredictionSerializer


logger = logging.getLogger(__name__)


class CropAndPredictAPIView(APIView):
    def post(self, request, *args, **kwargs):
        image_file = request.FILES.get("image")
        if not image_file:
            return Response({"error": "No image file provided"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            prediction_data = analyze_skin_image(image_file)
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception:
            logger.exception("Skin image analysis failed")
            return Response({"error": "Skin image analysis failed"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        serializer = PredictionSerializer(data=prediction_data)
        serializer.is_valid(raise_exception=True)

        if not request.user.is_authenticated:
            return Response(serializer.validated_data, status=status.HTTP_200_OK)

        prediction_instance = PredictionResult.objects.create(
            user=request.user,
            **serializer.validated_data,
        )
        result_serializer = PredictionSerializer(prediction_instance, context={"request": request})
        return Response(result_serializer.data, status=status.HTTP_200_OK)


class UserDiagnosticsAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        predictions = PredictionResult.objects.filter(user=request.user).order_by("-created_at")
        serializer = PredictionSerializer(predictions, many=True, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)


class PredictionResultDeleteAPIView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk, *args, **kwargs):
        prediction_result = get_object_or_404(PredictionResult, pk=pk, user=request.user)
        prediction_result.delete()
        return Response({"message": "해당 진단 결과가 삭제되었습니다."}, status=status.HTTP_204_NO_CONTENT)
