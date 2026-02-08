```js
psql -U username
```

```sql
CREATE DATABASE restore_biotime;
```
```sql
CREATE DATABASE presensi;
```

```js
psql -U username -d restore_biotime -f backup.sql;
```

```js
pg_restore -U postgres -d db_target --data-only deviceattendances.dump;
```

```sql
ALTER TABLE iclock_transaction
ADD COLUMN issend BOOLEAN DEFAULT FALSE;
```
ALTER TABLE personnel_employee_area
ADD COLUMN issend BOOLEAN DEFAULT FALSE;
```sql
ALTER TABLE personnel_employee
ADD COLUMN issend BOOLEAN DEFAULT FALSE;
```

```js
https://shorturl.at/AJld2
```

mkdir C:\cloudflared
cd C:\cloudflared

Invoke-WebRequest `
  -Uri https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe `
  -OutFile cloudflared.exe


.\cloudflared.exe --version

setx PATH "$env:PATH;C:\cloudflared" /M

cloudflared --version
cloudflared tunnel create my-tunnel
cloudflared tunnel route dns my-tunnel cloudflared-bakrie.absendulu.co.id
```js
tunnel: my-tunnel
credentials-file: C:\Users\<USER>\.cloudflared\<TUNNEL-ID>.json

ingress:
  - hostname: cloudflared-bakrie.absendulu.co.id
    service: http://localhost:8080
  - service: http_status:404
```
