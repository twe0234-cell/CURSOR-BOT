"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { RefreshCwIcon } from "lucide-react";

export default function RefreshButton() {
  const router = useRouter();
  return (
    <Button
      variant="outline"
      className="rounded-xl"
      onClick={() => router.refresh()}
    >
      <RefreshCwIcon className="size-4 ml-1" />
      רענן
    </Button>
  );
}
