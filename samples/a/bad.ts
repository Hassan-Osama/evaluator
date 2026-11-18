interface Student {
  id: string;
  name: string;
  projectScore?: number;
}

function generateReport(student: Student): string {
  const score = student.projectScore || 0;
  return "Student " + student.name + " has " + score;
}
