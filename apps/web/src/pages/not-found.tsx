import { Link } from "react-router";

import { PageFrame, PageHeader, Surface } from "../../components/ui";
import { routes } from "../../lib/navigation";

export default function NotFoundPage() {
  return (
    <Surface variant="hero">
      <PageFrame>
        <PageHeader
          eyebrow="404"
          title="Page not found"
          description="The page you are looking for does not exist or was moved."
        />
        <p>
          <Link to={routes.dashboard}>Back to the dashboard</Link>
        </p>
      </PageFrame>
    </Surface>
  );
}
