from django.urls import path
from .views import SurveyListCreateView, SurveyRetrieveUpdateDestroyView, UserRecommendationView

urlpatterns = [
    # 설문조사 생성 및 현재 사용자의 설문 데이터 조회 (회원/비회원 모두)
    path('surveys/', SurveyListCreateView.as_view(), name='survey-list-create'),

    # 특정 사용자의 설문 데이터 조회, 수정, 삭제 (user_id를 통해 접근)
    path('surveys/<str:user_id>/', SurveyRetrieveUpdateDestroyView.as_view(), name='survey-detail'),
    path('recommendations_data/', UserRecommendationView.as_view(), name='user-recommendations'),
]
