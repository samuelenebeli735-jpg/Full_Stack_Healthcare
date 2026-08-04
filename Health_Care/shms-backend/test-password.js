import { hashPassword, comparePassword } from "./src/utils/password.js";

async function test() {
  const password = "Samuel123";

  const hashed = await hashPassword(password);

  console.log("Hashed Password:");
  console.log(hashed);

  const match = await comparePassword(password, hashed);

  console.log("\nPassword Match:");
  console.log(match);
}

test();