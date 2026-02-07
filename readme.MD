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

