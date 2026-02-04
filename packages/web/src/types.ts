export interface Agent {
  agent_id: string;
  name: string;
  description: string;
  publisher: {
    display_name: string;
  };
  pricing: {
    model: string;
    amount: number;
  };
  tags: string[];
}
