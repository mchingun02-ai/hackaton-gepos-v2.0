# Байршуулах заавар (Alibaba ECS · Ubuntu)

**Шаардлага:** 2 vCPU / 2–4 GB RAM, Ubuntu 22.04 эсвэл 24.04, нийтийн IP. Security group-д зөвхөн 22, 80, 443 портыг нээнэ.

1. **Домэйн.** DNS-ийн A бичлэгийг серверийн IP руу чиглүүлнэ. Домэйнгүй бол `<IP-ийн-цэгийг-зураасаар>.sslip.io` хэлбэрийн хаяг (жишээ нь `47-1-2-3.sslip.io`) шууд ажиллана.
2. **Код татах:**
   ```bash
   sudo apt-get update && sudo apt-get install -y git rsync
   git clone https://github.com/<owner>/<repo>.git ~/gepos && cd ~/gepos
   ```
3. **Суулгах.** Өмнөх орчны өгөгдлийг шилжүүлэх бол `/etc/gepos.env`-ийг урьдчилан тавина (`AUTH_SECRET`, `FB_TOKEN_KEY` нь хуучин орчныхтой ижил байх ёстой — өгөгдөл тэдгээрээр шифрлэгдсэн) ба `DATA_TGZ=/root/gepos-data.tgz` өгнө. Эс бөгөөс анх ажиллуулахад `/etc/gepos.env` шинээр үүснэ.
   ```bash
   sudo GEPOS_DOMAIN=ai.example.mn DATA_TGZ=/root/gepos-data.tgz bash deploy/install.sh
   ```
4. **Тохиргоо.** `/etc/gepos.env`-д дараах утгуудыг бөглөнө:
   - `DASHSCOPE_API_KEY` — TokenHub түлхүүр
   - `AI_BASE_URL=https://api.tokenhub.mn/v1`
   - AI загварууд (`.env.example`-ийг харна)
   - `QPAY_*` (sandbox)
   - `FB_*` (хэрэв хэрэгтэй бол)

   Дараа нь 3-р алхмын командыг дахин ажиллуулна.
5. **Шалгах:**
   - `https://<домэйн>/ai` хаягаар нэвтэрнэ (демо: РД `6543210`, PIN `1234`).
   - Утсаараа тооллогын хуудсыг нээнэ: `https://<домэйн>/count`. Камер ажиллахад HTTPS заавал хэрэгтэй.
6. **Шинэчлэх:**
   ```bash
   cd ~/gepos && git pull && sudo bash deploy/update.sh
   ```

**Хаана юу байна:**
- Өгөгдөл: `/var/lib/gepos/`
- Шөнийн нөөцлөлт (03:30): `/var/backups/gepos/` (7 хоног хадгална)
- Лог: `journalctl -u gepos -f`
- HTTPS: Caddy автоматаар Let's Encrypt гэрчилгээ авна.

**Анхааруулга:**
- Аппыг нэг процессоор ажиллуулна. Олон инстанс асаахгүй (ARCHITECTURE.md §13).
- Facebook webhook-ийн хаяг: `https://<домэйн>/api/fb/webhook`
- QPay callback-ийн хаяг автоматаар `SP_PUBLIC_URL`-ээс үүснэ.

**Демо өгөгдлийн огноо.** Демо мерчантын зохиомол борлуулалт seed үүссэн өдрөөр огноотой байдаг тул хэдэн хоногийн дараа «өнөөдрийн борлуулалт 0₮» болж харагдана. Шүүлт эсвэл үзүүлэнгийн өглөө доорх скриптийг ажиллуулбал бүх огноо өнөөдөр хүртэл урагшилна:
```bash
sudo -u gepos env SP_DATA_DIR=/var/lib/gepos node /opt/gepos/app/scripts/demo-refresh-dates.mjs
```
