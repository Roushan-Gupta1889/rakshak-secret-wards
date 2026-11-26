import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConsoleLayout } from "@/layouts/ConsoleLayout";
import { MedicalRegistryPage } from "@/pages/MedicalRegistryPage";
import { OverviewPage } from "@/pages/OverviewPage";
import { Phase2CPlaceholder, PoliciesArchitecturePage } from "@/pages/PlaceholderPages";
import { SanitizationStudioPage } from "@/pages/SanitizationStudioPage";
import { UnlinkabilityLabPage } from "@/pages/UnlinkabilityLabPage";
import { useUiStore } from "@/stores/uiStore";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 10_000,
    },
  },
});

function ConsoleRouter() {
  const activePage = useUiStore((s) => s.activePage);

  switch (activePage) {
    case "overview":
      return <OverviewPage />;
    case "studio":
      return <SanitizationStudioPage />;
    case "registry":
      return <MedicalRegistryPage />;
    case "unlinkability":
      return <UnlinkabilityLabPage />;
    case "policies":
      return <PoliciesArchitecturePage />;
    case "privacy":
      return <Phase2CPlaceholder pageId={activePage} />;
    default:
      return <OverviewPage />;
  }
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ConsoleLayout>
        <ConsoleRouter />
      </ConsoleLayout>
    </QueryClientProvider>
  );
}

export default App;
