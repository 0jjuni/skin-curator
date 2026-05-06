import logging

from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from .ml import analyze_skin_image
from .models import PredictionResult
from .serializers import PredictionSerializer


logger = logging.getLogger(__name__)


def ensure_session_key(request):
    if not request.session.session_key:
        request.session.create()
    return request.session.session_key


def visible_predictions(request):
    session_key = ensure_session_key(request)
    query = Q(session_key=session_key)
    if request.user.is_authenticated:
        query |= Q(user=request.user)
    return PredictionResult.objects.filter(query)


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

        prediction_instance = PredictionResult.objects.create(
            user=request.user if request.user.is_authenticated else None,
            session_key=ensure_session_key(request),
            **serializer.validated_data,
        )
        result_serializer = PredictionSerializer(prediction_instance, context={"request": request})
        return Response(result_serializer.data, status=status.HTTP_200_OK)


class UserDiagnosticsAPIView(APIView):
    def get(self, request, *args, **kwargs):
        predictions = visible_predictions(request).order_by("-created_at")
        serializer = PredictionSerializer(predictions, many=True, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)


class PredictionResultDeleteAPIView(APIView):
    def delete(self, request, pk, *args, **kwargs):
        prediction_result = get_object_or_404(visible_predictions(request), pk=pk)
        prediction_result.delete()
        return Response({"message": "해당 진단 결과가 삭제되었습니다."}, status=status.HTTP_204_NO_CONTENT)
