import { createClient } from "@supabase/supabase-js";

export const SUPABASE_URL  = "https://trpwndxxwambskkwvpws.supabase.co";
export const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRycHduZHh4d2FtYnNra3d2cHdzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2MzUyNjIsImV4cCI6MjA4OTIxMTI2Mn0.m6JQ2cfzJ5kucNZRvyBte449Knzdx9TZGpIgpa8YZ5s";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);
