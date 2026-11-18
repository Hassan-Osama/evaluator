type Identifier = string | number;

const processID = (id: Identifier): number => {
  if (typeof id === "string") {
    return id.length;
  }
  return id * id;
};

console.log(processID("StudentA"));
console.log(processID(12));
