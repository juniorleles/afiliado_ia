export const ingredientsPrompt = {
  id: "ingredients",
  objective: "List name, description, and function for ingredients that already exist.",
  rule: "Description and function stay empty unless that wording is already inside the ingredient fact. Do not invent either.",
} as const;
