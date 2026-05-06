from django.urls import path

from .views import CropAndPredictAPIView, PredictionResultDeleteAPIView, UserDiagnosticsAPIView


urlpatterns = [
    path("diagnostics/", CropAndPredictAPIView.as_view(), name="predict"),
    path("diagnostics/history/", UserDiagnosticsAPIView.as_view(), name="diagnostics-history"),
    path("diagnostics/<int:pk>/delete/", PredictionResultDeleteAPIView.as_view(), name="prediction-result-delete"),
    path("diagnostics/delete/<int:pk>/", PredictionResultDeleteAPIView.as_view(), name="prediction-result-delete-legacy"),
]
