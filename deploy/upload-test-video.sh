#!/usr/bin/env bash
# ============================================================
# رفع فيديو تجريبي فعلي إلى VdoCipher عبر رابط الرفع المباشر
# الذي تعيده نقطة النهاية: POST /api/admin/lessons/:id/upload-credentials
#
# الاستخدام:
#   ./deploy/upload-test-video.sh credentials.json /path/to/video.mp4
#
# حيث credentials.json هو الناتج الخام لطلب upload-credentials، مثل:
# {
#   "videoId": "xxxxx",
#   "clientPayload": {
#     "uploadLink": "https://...",
#     "parameters": { "key": "...", "policy": "...", "signature": "...", ... }
#   }
# }
# ============================================================
set -e

CREDS_FILE="$1"
VIDEO_FILE="$2"

if [ -z "$CREDS_FILE" ] || [ -z "$VIDEO_FILE" ]; then
  echo "الاستخدام: $0 credentials.json video.mp4"
  exit 1
fi

UPLOAD_LINK=$(node -e "console.log(require('$CREDS_FILE').clientPayload.uploadLink)")

# يبني أمر curl -F ديناميكياً من كل مفتاح/قيمة داخل parameters، ثم يُلحق الملف أخيراً
FORM_ARGS=()
while IFS="=" read -r key value; do
  FORM_ARGS+=(-F "${key}=${value}")
done < <(node -e "
const c = require('$CREDS_FILE').clientPayload;
for (const [k, v] of Object.entries(c)) if (k !== 'uploadLink') console.log(k + '=' + v);
")

echo "جارٍ رفع الملف إلى VdoCipher..."
curl -sS -o /dev/null -w "HTTP status: %{http_code}\n" \
  "${FORM_ARGS[@]}" \
  -F "file=@${VIDEO_FILE}" \
  "$UPLOAD_LINK"

echo "تم إرسال الملف. تحقق من حالة المعالجة عبر:"
echo "  GET /api/admin/lessons/:lessonId/video-status  (حتى تصبح status = ready)"
