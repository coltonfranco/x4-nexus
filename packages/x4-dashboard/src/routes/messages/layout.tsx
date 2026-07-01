import { BookOpen, MessageSquare } from "lucide-react";

import { TabbedLayout } from "../../components/TabbedLayout";

const TABS = [
  { to: "/messages/inbox", label: "Inbox", icon: MessageSquare, exact: false },
  { to: "/messages/logbook", label: "Logbook", icon: BookOpen, exact: false },
] as const;

export function MessagesLayout() {
  return <TabbedLayout tabs={TABS} outletClassName="min-h-0 flex-1 overflow-auto" />;
}
