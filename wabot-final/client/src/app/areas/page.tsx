"use client";

import MainLayout from "@/components/layout/MainLayout";

export default function Page() {
  return (
    <MainLayout>
      <iframe
        src="/_legacy_areas.html"
        className="w-full border-0 rounded-xl"
        style={{ height: 'calc(100vh - 3rem)' }}
      />
    </MainLayout>
  );
}
