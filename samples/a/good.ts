interface Student {
  readonly id: string;
  name: string;
  projectScore?: number;
}

function generateReport(student: Student): string {
  const score = student.projectScore ?? 0;
  student.id = "changed"; // Error: Cannot assign to 'id' because it is a read-only property
  return `Student ${student.name} (ID: ${student.id}) scored ${score}.`;
}

console.log(generateReport({ id: "1", name: "Ali" }));
