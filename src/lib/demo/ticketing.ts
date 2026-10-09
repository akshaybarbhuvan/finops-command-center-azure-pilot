// Swappable ticketing client. The demo uses the local implementation only — nothing leaves the browser.
import type { Ticket } from "./types";

export interface TicketingClient {
  readonly name: string;
  readonly external: boolean;
  describe(): string;
  link(ticket: Ticket): string;
}

/** Local demo ticketing: tickets live in demo session state and link back to the recommendation. */
export class LocalDemoTicketingClient implements TicketingClient {
  readonly name = "Local Demo Ticketing";
  readonly external = false;
  describe() {
    return "Tickets are created in local demo state only. No ServiceNow, Jira or Azure DevOps calls are made.";
  }
  link(ticket: Ticket) {
    return `/tickets?id=${encodeURIComponent(ticket.id)}`;
  }
}

/**
 * Factory. In pilot/production an enterprise adapter (ServiceNow, Jira, Azure DevOps) would be selected here.
 * The demo build intentionally ships only the local client.
 */
export function getTicketingClient(): TicketingClient {
  return new LocalDemoTicketingClient();
}
