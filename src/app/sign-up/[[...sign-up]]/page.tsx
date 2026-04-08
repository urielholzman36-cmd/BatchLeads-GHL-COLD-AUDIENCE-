import { SignUp } from "@clerk/nextjs";

export default function Page() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center">
      <SignUp />
    </div>
  );
}
