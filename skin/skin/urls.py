from django.contrib import admin
from django.shortcuts import render
from django.urls import include, path


def home(request):
    return render(request, "dashboard.html")


# No /media/ route: marked-up face images are returned inline as base64
# data URLs (see diagnostics.ml.encode_marked_image), so no user-uploaded
# image is ever written to the server filesystem.
urlpatterns = [
    path("", home, name="home"),
    path("analysis/", home, name="analysis"),
    path("history/", home, name="history"),
    path("recommendations/", home, name="recommendations"),
    path("admin/", admin.site.urls),
    path("api/", include("diagnostics.urls")),
    path("api/", include("llm_diag.urls")),
    path("api/", include("reco.urls")),
]
