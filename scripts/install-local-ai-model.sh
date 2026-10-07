#!/usr/bin/env sh
set -eu

model_dir="${1:-/opt/fitness/models}"
model_name="qwen3-4b-instruct-2507-q4_k_s.gguf"
model_url="https://huggingface.co/bartowski/Qwen_Qwen3-4B-Instruct-2507-GGUF/resolve/ae44f08e1392f39c0e474af10c3ff8355c8b6688/Qwen_Qwen3-4B-Instruct-2507-Q4_K_S.gguf"
expected_sha256="952af947c6aabf7b72f7d8e279e76f7bf4b0d12431eb3abb588ef312865622d8"

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
