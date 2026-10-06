#!/usr/bin/env sh
set -eu

model_dir="${1:-/opt/fitness/models}"
model_name="qwen3-1.7b-q4_k_m.gguf"
model_url="https://huggingface.co/unsloth/Qwen3-1.7B-GGUF/resolve/d7f544eead698dbd1f15126ef60b45a1e1933222/Qwen3-1.7B-Q4_K_M.gguf"
expected_sha256="b139949c5bd74937ad8ed8c8cf3d9ffb1e99c866c823204dc42c0d91fa181897"

mkdir -p "$model_dir"
partial_path="$model_dir/${model_name}.part"
final_path="$model_dir/$model_name"

if [ -f "$final_path" ] && echo "$expected_sha256  $final_path" | sha256sum --check --status; then
  echo "MODEL_OK $final_path"
  exit 0
fi

curl --fail --location --retry 4 --continue-at - --output "$partial_path" "$model_url"
echo "$expected_sha256  $partial_path" | sha256sum --check
mv "$partial_path" "$final_path"
chmod 644 "$final_path"
echo "MODEL_INSTALLED $final_path"
