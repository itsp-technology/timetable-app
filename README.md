PowerShell breaks multiline arguments when passing `--command` to Node CLI tools like Wrangler.

To fix this, use either a seed SQL file (recommended) or run the query as a single-line command.

---

### Option 1: Use a Seed File (Recommended)

Using `--file` completely avoids PowerShell quoting and multiline parsing issues.

1. Create a seed file at `timetable-app/api/seed.sql`:

```sql
INSERT INTO subjects (id, user_id, name, course_code, room_number, created_at, updated_at) 
VALUES ('sub_1', 'user_test', 'Computer Networks', 'CS501', 'Room 302', 1700000000000, 1700000000000);

INSERT INTO timetable_slots (id, user_id, subject_id, day_of_week, start_time_minutes, end_time_minutes, created_at, updated_at)
VALUES ('slot_1', 'user_test', 'sub_1', 1, 540, 600, 1700000000000, 1700000000000);

```

2. Execute it via the `--file` flag:

```powershell
npx wrangler d1 execute student_timetable_db --local --file=./seed.sql

```

---

### Option 2: Execute as a Single-Line Command

If you prefer running it inline, strip the line breaks so PowerShell passes the argument cleanly:

```powershell
npx wrangler d1 execute student_timetable_db --local --command="INSERT INTO subjects (id, user_id, name, course_code, room_number, created_at, updated_at) VALUES ('sub_1', 'user_test', 'Computer Networks', 'CS501', 'Room 302', 1700000000000, 1700000000000); INSERT INTO timetable_slots (id, user_id, subject_id, day_of_week, start_time_minutes, end_time_minutes, created_at, updated_at) VALUES ('slot_1', 'user_test', 'sub_1', 1, 540, 600, 1700000000000, 1700000000000);"

```

---

### Verify the Data

Confirm the rows were inserted into your local D1 instance:

```powershell
npx wrangler d1 execute student_timetable_db --local --command="SELECT * FROM subjects;"

```


The error occurs because `0001_init.sql` is located inside the `migrations/` directory, not the current root directory (`api/`).

Run either of the following commands from `D:\ALL-APP-FILES\timetable-app\api`:

### Option 1: Use the Official Migration Command (Recommended)

Because `migrations_dir = "migrations"` is already set in your `wrangler.toml`, Wrangler will automatically detect and apply all numbered SQL files inside `migrations/`:

```bash
npx wrangler d1 migrations apply student_timetable_db --local

```

---

### Option 2: Provide the Correct Relative Path to `--file`

If executing directly via the `--file` flag, update the path to point into the `migrations` folder:

```bash
npx wrangler d1 execute student_timetable_db --local --file=./migrations/0001_init.sql

```

---

### Verify Execution

Verify that the tables were created successfully:

```bash
npx wrangler d1 execute student_timetable_db --local --command="PRAGMA table_list;"

```

You will see `users`, `session_categories`, `subjects`, `timetable_slots`, and `attendance_records` listed in the output table.