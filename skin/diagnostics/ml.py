import base64
import logging
import os
from functools import lru_cache

import cv2
import mediapipe as mp
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
import torchvision.transforms as T
from django.conf import settings
from PIL import Image
from torchvision import models


logger = logging.getLogger(__name__)
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

transform = T.Compose([
    T.Resize((224, 224)),
    T.ToTensor(),
    T.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
])


@lru_cache(maxsize=1)
def get_face_mesh():
    return mp.solutions.face_mesh.FaceMesh(
        static_image_mode=True,
        max_num_faces=1,
        min_detection_confidence=0.5,
    )


def resnext_three_class_with_batchnorm():
    model = models.resnext50_32x4d(weights=None)
    model.fc = nn.Sequential(
        nn.Linear(model.fc.in_features, 3),
        nn.BatchNorm1d(3),
    )
    return model


def resnext_binary():
    model = models.resnext50_32x4d(weights=None)
    model.fc = nn.Linear(model.fc.in_features, 2)
    return model


def resnext_three_class_with_dropout():
    model = models.resnext50_32x4d(weights=None)
    model.fc = nn.Sequential(
        nn.BatchNorm1d(model.fc.in_features),
        nn.Dropout(0.25),
        nn.Linear(model.fc.in_features, 3),
    )
    return model


def load_state(model, file_name):
    model_path = os.path.join(settings.WEIGHTS_DIR, file_name)
    model.load_state_dict(torch.load(model_path, map_location=device, weights_only=True))
    model.to(device)
    model.eval()
    return model


@lru_cache(maxsize=1)
def get_models():
    logger.info("Loading skin diagnosis models")
    return {
        "pore": load_state(resnext_three_class_with_batchnorm(), "pore_model.pth"),
        "pigmentation": load_state(resnext_three_class_with_batchnorm(), "pigmentation_model.pth"),
        "moisture": load_state(resnext_binary(), "moisture_model.pth"),
        "lips_dryness": load_state(resnext_three_class_with_dropout(), "lips_dryness_model.pth"),
        "skin_type": load_state(resnext_three_class_with_dropout(), "skin_type_model.pth"),
    }


def decode_image(uploaded_file):
    image_bytes = np.asarray(bytearray(uploaded_file.read()), dtype=np.uint8)
    image = cv2.imdecode(image_bytes, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("이미지를 읽을 수 없습니다.")
    return image


def predict_image(image, model):
    image = Image.fromarray(image).convert("RGB")
    tensor = transform(image).unsqueeze(0).to(device)

    with torch.no_grad():
        outputs = model(tensor)
        probabilities = F.softmax(outputs, dim=1)
        _, predicted = torch.max(outputs, 1)

    return predicted.item(), probabilities.squeeze().cpu().numpy()


def extract_face_parts(image):
    image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
    results = get_face_mesh().process(image_rgb)

    if not results.multi_face_landmarks:
        return None, None, None, None, None

    landmarks = results.multi_face_landmarks[0].landmark
    h, w, _ = image.shape

    forehead = image[
        max(0, int(landmarks[10].y * h) - 30):min(h, int(landmarks[68].y * h)),
        max(0, int(landmarks[21].x * w)):min(w, int(landmarks[251].x * w)),
    ]
    left_cheek = image[
        int(landmarks[228].y * h):int(landmarks[214].y * h),
        int(landmarks[58].x * w):int(landmarks[203].x * w),
    ]
    right_cheek = image[
        int(landmarks[448].y * h):int(landmarks[434].y * h),
        int(landmarks[423].x * w):int(landmarks[376].x * w),
    ]
    lips = image[
        max(0, int(landmarks[13].y * h)):min(h, int(landmarks[17].y * h)),
        max(0, int(landmarks[61].x * w)):min(w, int(landmarks[291].x * w)),
    ]

    return forehead, left_cheek, right_cheek, lips, landmarks


def require_crop(crop, name):
    if crop is None or crop.size == 0:
        raise ValueError(f"{name} 영역을 감지하지 못했습니다.")
    return crop


def encode_marked_image(image, landmarks):
    """Draw the FaceMesh landmarks on the image and return a data URL.

    The marked image is never written to disk — we encode it as an
    inline base64 data URL so the user's photo leaves no trace on the
    server filesystem after the response is sent.
    """
    h, w, _ = image.shape
    if max(h, w) >= 1500:
        point_size = 5
    elif max(h, w) >= 1000:
        point_size = 3
    else:
        point_size = 1

    for landmark in landmarks:
        x = int(landmark.x * w)
        y = int(landmark.y * h)
        cv2.circle(image, (x, y), point_size, (0, 255, 0), -1)

    success, buffer = cv2.imencode(".jpg", image, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
    if not success:
        return None
    encoded = base64.b64encode(buffer.tobytes()).decode("ascii")
    return f"data:image/jpeg;base64,{encoded}"


def analyze_skin_image(uploaded_file):
    image = decode_image(uploaded_file)
    forehead, left_cheek, right_cheek, lips, landmarks = extract_face_parts(image)
    if landmarks is None:
        raise ValueError("얼굴 랜드마크를 감지하지 못했습니다.")

    forehead = require_crop(forehead, "이마")
    left_cheek = require_crop(left_cheek, "왼쪽 볼")
    right_cheek = require_crop(right_cheek, "오른쪽 볼")
    lips = require_crop(lips, "입술")
    loaded_models = get_models()

    predicted_left_pore, prob_left_pore = predict_image(left_cheek, loaded_models["pore"])
    predicted_right_pore, prob_right_pore = predict_image(right_cheek, loaded_models["pore"])
    predicted_forehead, prob_forehead = predict_image(forehead, loaded_models["pigmentation"])

    predicted_left_moisture, prob_left_moisture = predict_image(left_cheek, loaded_models["moisture"])
    predicted_right_moisture, prob_right_moisture = predict_image(right_cheek, loaded_models["moisture"])
    predicted_forehead_moisture, prob_forehead_moisture = predict_image(forehead, loaded_models["moisture"])

    predicted_lips_dryness, prob_lips_dryness = predict_image(lips, loaded_models["lips_dryness"])

    predicted_left_skin, prob_left_skin = predict_image(left_cheek, loaded_models["skin_type"])
    predicted_right_skin, prob_right_skin = predict_image(right_cheek, loaded_models["skin_type"])
    avg_prob_skin = (prob_left_skin + prob_right_skin) / 2
    final_skin_prediction = np.argmax(avg_prob_skin)

    return {
        "skin_type_prediction": final_skin_prediction,
        "skin_type_probabilities": avg_prob_skin.tolist(),
        "forehead_pigmentation_prediction": predicted_forehead,
        "forehead_pigmentation_probabilities": prob_forehead.tolist(),
        "left_cheek_pore_prediction": predicted_left_pore,
        "left_cheek_pore_probabilities": prob_left_pore.tolist(),
        "right_cheek_pore_prediction": predicted_right_pore,
        "right_cheek_pore_probabilities": prob_right_pore.tolist(),
        "forehead_moisture_prediction": predicted_forehead_moisture,
        "forehead_moisture_probabilities": prob_forehead_moisture.tolist(),
        "left_cheek_moisture_prediction": predicted_left_moisture,
        "left_cheek_moisture_probabilities": prob_left_moisture.tolist(),
        "right_cheek_moisture_prediction": predicted_right_moisture,
        "right_cheek_moisture_probabilities": prob_right_moisture.tolist(),
        "lips_dryness_prediction": predicted_lips_dryness,
        "lips_dryness_probabilities": prob_lips_dryness.tolist(),
        "marked_image_url": encode_marked_image(image, landmarks),
    }
