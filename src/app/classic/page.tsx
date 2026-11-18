import PosApp from "@/components/PosApp";
import { StoreProvider } from "@/lib/store";
import { HqProvider } from "@/lib/hq";

export default function Page() {
  return (
    <StoreProvider>
      <HqProvider>
        <PosApp />
      </HqProvider>
    </StoreProvider>
  );
}
