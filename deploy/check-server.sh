#!/usr/bin/env bash
# Read-only checks. No installation, configuration edits or service restarts.
set -u
printf '\n--- 系统版本 ---\n'
if [ -r /etc/os-release ]; then cat /etc/os-release; fi
printf '\n--- 当前用户 ---\n'
id -un
printf '\n--- Git / Node / npm ---\n'
for program in git node npm; do
  if command -v "$program" >/dev/null 2>&1; then
    "$program" --version
  else
    printf '%s: 未安装或不在PATH\n' "$program"
  fi
done
printf '\n--- 正在监听的TCP端口（不显示进程参数） ---\n'
if command -v ss >/dev/null 2>&1; then ss -ltn; fi
printf '\n--- Nginx状态 ---\n'
if command -v nginx >/dev/null 2>&1; then nginx -v 2>&1; else printf 'nginx: 未安装或不在PATH\n'; fi
if command -v systemctl >/dev/null 2>&1; then
  systemctl is-active nginx 2>/dev/null || true
  printf '\n--- 圣诞树服务是否已存在 ---\n'
  systemctl show christmas-tree.service --property=LoadState --property=ActiveState 2>/dev/null || true
fi
printf '\n--- 计划部署目录是否已存在 ---\n'
for target in /srv/christmas-tree /var/www/christmas-tree; do
  if [ -e "$target" ]; then printf '%s: 已存在，部署前需核实\n' "$target"; else printf '%s: 不存在\n' "$target"; fi
done
printf '\n检查结束：未修改网站、配置、端口或服务。\n'
