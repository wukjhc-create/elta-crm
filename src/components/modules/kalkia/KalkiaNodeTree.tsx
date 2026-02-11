'use client'

import { useState } from 'react'
import {
  ChevronRight,
  ChevronDown,
  FolderTree,
  Wrench,
  Layers,
  Clock,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatTimeSeconds, formatCurrency } from '@/lib/utils/format'
import type { KalkiaNodeWithRelations, KalkiaNodeType } from '@/types/kalkia.types'

interface KalkiaNodeTreeProps {
  nodes: KalkiaNodeWithRelations[]
  selectedNodeId?: string | null
  onNodeSelect?: (node: KalkiaNodeWithRelations) => void
  expandedByDefault?: boolean
  showTime?: boolean
  showPrice?: boolean
}

const nodeTypeIcons: Record<KalkiaNodeType, React.ElementType> = {
  group: FolderTree,
  operation: Wrench,
  composite: Layers,
}

const nodeTypeColors: Record<KalkiaNodeType, string> = {
  group: 'text-blue-600',
  operation: 'text-yellow-600',
  composite: 'text-purple-600',
}

interface TreeNodeProps {
  node: KalkiaNodeWithRelations
  level: number
  selectedNodeId?: string | null
  onNodeSelect?: (node: KalkiaNodeWithRelations) => void
  expandedNodes: Set<string>
  toggleExpanded: (nodeId: string) => void
  showTime?: boolean
  showPrice?: boolean
}

function TreeNode({
  node,
  level,
  selectedNodeId,
  onNodeSelect,
  expandedNodes,
  toggleExpanded,
  showTime,
  showPrice,
}: TreeNodeProps) {
  const Icon = nodeTypeIcons[node.node_type]
  const colorClass = nodeTypeColors[node.node_type]
  const hasChildren = node.children && node.children.length > 0
  const isExpanded = expandedNodes.has(node.id)
  const isSelected = selectedNodeId === node.id


  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-2 py-1.5 px-2 rounded-md cursor-pointer transition-colors',
          isSelected
            ? 'bg-blue-100 text-blue-900'
            : 'hover:bg-gray-100'
        )}
        style={{ paddingLeft: `${level * 20 + 8}px` }}
        onClick={() => onNodeSelect?.(node)}
      >
        {hasChildren ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-5 p-0"
            onClick={(e) => {
              e.stopPropagation()
              toggleExpanded(node.id)
            }}
          >
            {isExpanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </Button>
        ) : (
          <span className="w-5" />
        )}

        <Icon className={cn('w-4 h-4', colorClass)} />

        <span className="font-medium text-sm">{node.name}</span>

        <Badge variant="outline" className="text-xs ml-1">
          {node.code}
        </Badge>

        {showTime && node.base_time_seconds > 0 && (
          <span className="text-xs text-gray-500 flex items-center gap-1 ml-auto">
            <Clock className="w-3 h-3" />
            {formatTimeSeconds(node.base_time_seconds)}
          </span>
        )}

        {showPrice && node.default_sale_price > 0 && (
          <span className="text-xs text-gray-500 ml-2">
            {formatCurrency(node.default_sale_price)}
          </span>
        )}

        {node.variants && node.variants.length > 0 && (
          <Badge variant="secondary" className="text-xs ml-2">
            {node.variants.length} var
          </Badge>
        )}
      </div>

      {hasChildren && isExpanded && (
        <div>
          {node.children!.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              level={level + 1}
              selectedNodeId={selectedNodeId}
              onNodeSelect={onNodeSelect}
              expandedNodes={expandedNodes}
              toggleExpanded={toggleExpanded}
              showTime={showTime}
              showPrice={showPrice}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function KalkiaNodeTree({
  nodes,
  selectedNodeId,
  onNodeSelect,
  expandedByDefault = false,
  showTime = true,
  showPrice = false,
}: KalkiaNodeTreeProps) {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(() => {
    if (expandedByDefault) {
      const allIds = new Set<string>()
      const collectIds = (nodeList: KalkiaNodeWithRelations[]) => {
        for (const node of nodeList) {
          allIds.add(node.id)
          if (node.children) collectIds(node.children)
        }
      }
      collectIds(nodes)
      return allIds
    }
    return new Set()
  })

  const toggleExpanded = (nodeId: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev)
      if (next.has(nodeId)) {
        next.delete(nodeId)
      } else {
        next.add(nodeId)
      }
      return next
    })
  }

  if (nodes.length === 0) {
    return (
      <div className="text-center text-gray-500 py-8">
        <FolderTree className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">Ingen noder fundet</p>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      {nodes.map((node) => (
        <TreeNode
          key={node.id}
          node={node}
          level={0}
          selectedNodeId={selectedNodeId}
          onNodeSelect={onNodeSelect}
          expandedNodes={expandedNodes}
          toggleExpanded={toggleExpanded}
          showTime={showTime}
          showPrice={showPrice}
        />
      ))}
    </div>
  )
}
