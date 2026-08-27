#!/usr/bin/env sh
set -eu

model_dir="${1:-/opt/fitness/models}"
model_name="qwen2.5-3b-instruct-q4_k_m.gguf"
model_url="https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/${model_name}?download=true"
expected_sha256="626b4a6678b86442240e33df819e00132d3ba7dddfe1cdc4fbb18e0a9615c62d"

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
