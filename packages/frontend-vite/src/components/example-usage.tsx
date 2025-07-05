// Example: How to use the new TanStack Query hooks
import {
  useCurrentUser,
  useUserFiles,
  useDeleteUserFile,
  useMarkFileDownloaded,
  type UserFile,
} from "@/lib/api-hooks";
import { Button } from "@/components/ui/button";

export function ExampleUsage() {
  // ✨ Look how clean this is! No manual loading states, no manual error handling
  const {
    data: user,
    isLoading: userLoading,
    error: userError,
  } = useCurrentUser();
  const {
    data: userFiles,
    isLoading: filesLoading,
    error: filesError,
  } = useUserFiles();

  // ✨ Mutations with optimistic updates built-in
  const deleteFile = useDeleteUserFile();
  const markDownloaded = useMarkFileDownloaded();

  if (userLoading || filesLoading) {
    return <div>Loading...</div>;
  }

  if (userError || filesError) {
    return <div>Error: {userError?.message || filesError?.message}</div>;
  }

  return (
    <div>
      <h2>Welcome, {user?.name}!</h2>
      <p>Conversions used: {user?.usage?.conversions_count}</p>

      <div>
        <h3>Your Files ({userFiles?.count || 0})</h3>
        {userFiles?.files.map((file: UserFile) => (
          <div key={file.id} className="border p-4 rounded">
            <p>{file.original_file_name}</p>
            <p>Status: {file.status}</p>

            <Button
              onClick={() => markDownloaded.mutate(file.id)}
              disabled={markDownloaded.isPending}
            >
              {markDownloaded.isPending ? "Marking..." : "Mark Downloaded"}
            </Button>

            <Button
              variant="destructive"
              onClick={() => deleteFile.mutate(file.id)}
              disabled={deleteFile.isPending}
            >
              {deleteFile.isPending ? "Deleting..." : "Delete"}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ✨ Compare this to the old way:
// - No useState for loading/error states
// - No useEffect for data fetching
// - No manual error handling
// - Automatic caching and background refetching
// - Optimistic updates for mutations
// - Automatic query invalidation
