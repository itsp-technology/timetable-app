INSERT INTO subjects (id, user_id, name, course_code, room_number, created_at, updated_at) 
VALUES ('sub_1', 'user_test', 'Computer Networks', 'CS501', 'Room 302', 1700000000000, 1700000000000);

INSERT INTO timetable_slots (id, user_id, subject_id, day_of_week, start_time_minutes, end_time_minutes, created_at, updated_at)
VALUES ('slot_1', 'user_test', 'sub_1', 1, 540, 600, 1700000000000, 1700000000000);