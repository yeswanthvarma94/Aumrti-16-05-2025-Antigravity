import React, { useState, useEffect } from "react";
import { format } from "date-fns";
import { CalendarIcon, Download, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface AttendanceRow {
  userId: string;
  fullName: string;
  role: string;
  deptName: string;
  shiftName: string;
  inTime: string | null;
  outTime: string | null;
  hoursWorked: number | null;
  status: string;
  attendanceId: string | null;
}

const statusOptions = ["present", "absent", "half_day", "late", "on_leave", "holiday"];
const statusColors: Record<string, string> = {
  present: "bg-success/10 text-success",
  absent: "bg-destructive/10 text-destructive",
  half_day: "bg-accent/10 text-accent-foreground",
  late: "bg-accent/10 text-accent-foreground",
  on_leave: "bg-primary/10 text-primary",
  holiday: "bg-muted text-muted-foreground",
};

const AttendanceTab: React.FC = () => {
  const { toast } = useToast();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [deptFilter, setDeptFilter] = useState("all");
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);

  const dateStr = format(selectedDate, "yyyy-MM-dd");

  useEffect(() => {
    const load = async () => {
      const [staffRes, attRes, rosterRes, deptRes] = await Promise.all([
        supabase.from("users").select("id, full_name, role, department_id, departments(name)").eq("is_active", true).order("full_name"),
        (supabase as any).from("staff_attendance").select("*").eq("attendance_date", dateStr),
        (supabase as any).from("duty_roster").select("*, shift_master(shift_name)").eq("roster_date", dateStr),
        supabase.from("departments").select("id, name").eq("is_active", true).order("name", { ascending: true }),
      ]);

      const staffList = staffRes.data || [];
      const attList = attRes.data || [];
      const rosterList = rosterRes.data || [];

      const merged: AttendanceRow[] = staffList.map((s: any) => {
        const att = attList.find((a: any) => a.user_id === s.id);
        const rost = rosterList.find((r: any) => r.user_id === s.id);
        return {
          userId: s.id,
          fullName: s.full_name,
          role: s.role,
          deptName: s.departments?.name || "—",
          shiftName: (rost as any)?.shift_master?.shift_name || "—",
          inTime: att?.in_time || null,
          outTime: att?.out_time || null,
          hoursWorked: att?.hours_worked || null,
          status: att?.status || "",
          attendanceId: att?.id || null,
        };
      });

      setRows(merged);
      setDepartments(deptRes.data || []);
    };
    load();
  }, [dateStr]);

  const filteredRows = deptFilter === "all" ? rows : rows.filter((r) => {
    const staff = rows.find((s) => s.userId === r.userId);
    return staff?.deptName === departments.find((d) => d.id === deptFilter)?.name;
  });

  const summary = {
    present: rows.filter((r) => r.status === "present" || r.status === "late").length,
    absent: rows.filter((r) => r.status === "absent").length,
    late: rows.filter((r) => r.status === "late").length,
  };

  const markStatus = async (userId: string, status: string) => {
    const { data: userData } = await supabase.from("users").select("hospital_id").eq("id", userId).maybeSingle();
    if (!userData) return;

    const { error } = await (supabase as any).from("staff_attendance").upsert(
      {
        hospital_id: userData.hospital_id,
        user_id: userId,
        attendance_date: dateStr,
        status,
        source: "manual",
      },
      { onConflict: "hospital_id,user_id,attendance_date" }
    );

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setRows((prev) =>
        prev.map((r) => (r.userId === userId ? { ...r, status } : r))
      );
    }
  };

  const markAllPresent = async () => {
    const unmarked = rows.filter((r) => !r.status);
    for (const row of unmarked) {
      await markStatus(row.userId, "present");
    }
    toast({ title: `Marked ${unmarked.length} staff as present` });
  };

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Header */}
      <div className="h-12 flex-shrink-0 bg-card border-b border-border flex items-center gap-3 px-5">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="text-xs gap-1.5">
              <CalendarIcon className="h-3.5 w-3.5" />
              {format(selectedDate, "dd MMM yyyy")}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={selectedDate} onSelect={(d) => d && setSelectedDate(d)} className="p-3 pointer-events-auto" />
          </PopoverContent>
        </Popover>

        <Select value={deptFilter} onValueChange={setDeptFilter}>
          <SelectTrigger className="w-[180px] h-8 text-xs">
            <SelectValue placeholder="All Departments" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Departments</SelectItem>
            {departments.map((d) => (
              <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-3 ml-4">
          <span className="text-xs px-2.5 py-1 rounded-full bg-success/10 text-success font-medium">
            Present: {summary.present}
          </span>
          <span className="text-xs px-2.5 py-1 rounded-full bg-destructive/10 text-destructive font-medium">
            Absent: {summary.absent}
          </span>
          <span className="text-xs px-2.5 py-1 rounded-full bg-accent/10 text-accent-foreground font-medium">
            Late: {summary.late}
          </span>
        </div>

        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" className="text-xs gap-1.5" onClick={markAllPresent}>
            <CheckCircle2 className="h-3 w-3" /> Mark All Present
          </Button>
          <Button variant="ghost" size="sm" className="text-xs gap-1.5">
            <Download className="h-3 w-3" /> Export
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-card z-10">
            <tr className="border-b border-border">
              <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground">Staff</th>
              <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground">Role</th>
              <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground">Dept</th>
              <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground">Shift</th>
              <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground">In</th>
              <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground">Out</th>
              <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground">Hours</th>
              <th className="text-left px-3 py-2.5 font-semibold text-muted-foreground">Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row) => (
              <tr key={row.userId} className="border-b border-border/50 hover:bg-muted/30">
                <td className="px-4 py-2 font-medium text-foreground">{row.fullName}</td>
                <td className="px-3 py-2 text-muted-foreground capitalize">{row.role}</td>
                <td className="px-3 py-2 text-muted-foreground">{row.deptName}</td>
                <td className="px-3 py-2 text-muted-foreground">{row.shiftName}</td>
                <td className="px-3 py-2 text-muted-foreground">{row.inTime?.slice(0, 5) || "—"}</td>
                <td className="px-3 py-2 text-muted-foreground">{row.outTime?.slice(0, 5) || "—"}</td>
                <td className="px-3 py-2 text-muted-foreground">{row.hoursWorked ?? "—"}</td>
                <td className="px-3 py-2">
                  <Select value={row.status || "unmarked"} onValueChange={(v) => markStatus(row.userId, v)}>
                    <SelectTrigger className={cn("h-7 w-[110px] text-[10px] border-0", statusColors[row.status] || "bg-muted/50 text-muted-foreground")}>
                      <SelectValue placeholder="Mark" />
                    </SelectTrigger>
                    <SelectContent>
                      {statusOptions.map((s) => (
                        <SelectItem key={s} value={s} className="text-xs capitalize">{s.replace("_", " ")}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AttendanceTab;
