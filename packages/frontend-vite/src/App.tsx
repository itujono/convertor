import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { HelmetProvider } from "react-helmet-async";
import { Toaster } from "sonner";
import { AuthProvider } from "./lib/auth-context";

// Import the generated route tree
import { routeTree } from "./routeTree.gen";

// Create a client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
      retry: (failureCount, error: unknown) => {
        // Don't retry on auth errors
        if (
          error instanceof Error &&
          (error.message.includes("Invalid token") ||
            error.message.includes("JWT"))
        ) {
          return false;
        }
        return failureCount < 3;
      },
    },
    mutations: {
      retry: 1,
    },
  },
});

// Create a new router instance
const router = createRouter({
  routeTree,
  defaultPreload: "intent",
});

// Register the router instance for type safety
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

function App() {
  return (
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <RouterProvider router={router} />
          <Toaster
            // richColors
            position="top-right"
            toastOptions={{
              style: {
                backdropFilter: "blur(8px)",
                boxShadow:
                  "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
              },
              classNames: {
                toast:
                  "backdrop-blur-sm bg-white/95 border-black/10 rounded-xl",
                success:
                  "!bg-white/95 !border-black/10 !text-green-700 rounded-xl",
                error: "!bg-white/95 !border-black/10 !text-red-700 rounded-xl",
                warning:
                  "!bg-white/95 !border-black/10 !text-amber-700 rounded-xl",
                info: "!bg-white/95 !border-black/10 !text-blue-700 rounded-xl",
              },
            }}
          />
          <ReactQueryDevtools initialIsOpen={false} />
        </AuthProvider>
      </QueryClientProvider>
    </HelmetProvider>
  );
}

export default App;
