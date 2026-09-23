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

If executing directly via the `--file` flag, updat the path to point into the `migrations` folder:

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


---

How you update your app depends entirely on **what kind of feature** you add. Expo and EAS provide two different workflows for updates:

---

### Method 1: Over-the-Air (OTA) Updates (`eas update`)

* **Use this for 95% of updates:** New UI screens, changing study categories, logic fixes, styling changes, new themes, or database queries.
* **Why it's great:** You **do not** need to generate a new APK, and students **do not** need to download or reinstall anything. The app updates automatically the next time they open it with an internet connection.

#### How to deploy an OTA update:

1. Make your code changes in VS Code and test them locally.
2. Commit your changes to git:
```bash
git add .
git commit -m "feat: added new feature"
git push origin main

```


3. Run the EAS update command in your terminal (`mobile/` folder):
```bash
eas update --branch production --message "Added new feature"

```


4. **Result:** All students using your APK will receive the new feature instantly upon relaunching the app.

---

### Method 2: Full APK Rebuild (`eas build`)

* **Use this ONLY when adding native modules:** If you add a feature that requires native device permissions or native packages (e.g., adding a native Bluetooth sync library, custom camera module, or changing the Android package name in `app.json`).
* **Why it's required:** Native code cannot be sent over-the-air; it requires recompiling the Android binary.

#### How to release a new APK:

1. Make your code changes and commit them.
2. Increment the version number inside `mobile/app.json` (e.g., change `"version": "1.0.0"` to `"version": "1.1.0"`).
3. Run the build command again:
```bash
eas build -p android --profile preview

```


*(Or add `--local` if you prefer compiling it locally without waiting in the cloud queue).*
4. **Result:** EAS generates a new `.apk` download link. You must share this new `.apk` file with your students so they can install/upgrade over their existing version.



Step-by-Step Verification
Rebuild the D1 Local Schema:

Bash
cd D:\ALL-APP-FILES\timetable-app\api
npx wrangler d1 migrations apply student_timetable_db --local
npm run dev
Reload Web Application:
Press Ctrl + F5 on http://localhost:808