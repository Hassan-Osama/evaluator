type Identifier = string | number;
const processID = (id: any) => {
  if (typeof id === "string") return id.length;
  return id * 2;
};
console.log(processID("StudentA"));
