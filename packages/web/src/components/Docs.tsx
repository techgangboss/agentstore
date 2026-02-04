import React from 'react';
import { FileText, Book, Code, Github, ExternalLink } from 'lucide-react';

export function Docs() {
  const links = [
    {
      title: "Getting Started",
      desc: "Installation and first agent setup",
      icon: FileText,
      url: "#"
    },
    {
      title: "Publisher Guide",
      desc: "How to create and submit agents",
      icon: Book,
      url: "https://github.com/techgangboss/agentstore/blob/main/docs/PUBLISHER.md"
    },
    {
      title: "API Reference",
      desc: "Endpoints and integration details",
      icon: Code,
      url: "#"
    }
  ];

  return (
    <section className="py-24 bg-[#050505] border-t border-white/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-3xl font-bold text-white mb-10">Documentation</h2>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {links.map((link) => (
            <a
              key={link.title}
              href={link.url}
              target={link.url.startsWith('http') ? "_blank" : "_self"}
              rel={link.url.startsWith('http') ? "noopener noreferrer" : ""}
              className="group block p-6 bg-[#111] rounded-xl border border-white/10 hover:border-teal-500/40 hover:bg-[#151515] transition-all"
            >
              <div className="flex justify-between items-start mb-4">
                <link.icon className="w-6 h-6 text-gray-400 group-hover:text-teal-400 transition-colors" />
                <ExternalLink className="w-4 h-4 text-gray-600 group-hover:text-gray-400 opacity-0 group-hover:opacity-100 transition-all" />
              </div>
              <h3 className="font-bold text-white mb-2 group-hover:text-teal-400 transition-colors">{link.title}</h3>
              <p className="text-sm text-gray-500">{link.desc}</p>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
