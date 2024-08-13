import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

import { ProcessedCluster } from '../DocumentProvider/types';
import { Button } from '@nextui-org/react';
import { useText } from '@/components';
import { Col, Modal, Row, Select, Tag } from 'antd';
import {
  selectDocumentTaxonomy,
  useSelector,
} from '../DocumentProvider/selectors';
import { getAllNodeData } from '@/components/Tree';
import {
  DndContext,
  closestCenter,
  DragEndEvent,
  UniqueIdentifier,
  closestCorners,
  DragOverlay,
  DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
interface EditClustersProps {
  clusterGroups: {
    [key: string]: ProcessedCluster[];
  };
}
interface Item {
  id: string;
  content: string;
}

interface Container {
  id: string;
  title: string;
  items: Item[];
}

interface State {
  [key: string]: Container;
}
interface SortableItemProps {
  id: UniqueIdentifier;
  name: string;
  activeId?: UniqueIdentifier;
}

const SortableItem: React.FC<SortableItemProps> = ({ id, name, activeId }) => {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? undefined,
    padding: '10px',
    border: '1px solid #ccc',
    borderRadius: 10,
    marginBottom: '4px',
    backgroundColor: activeId === id ? '#d2d2d4' : 'white',
    cursor: 'grab',
    zIndex: transform ? 1 : 'auto',
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {name}
    </div>
  );
};
const EditClusters = ({ clusterGroups }: EditClustersProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [sourceCluster, setSourceCluster] = useState<ProcessedCluster | null>(
    null
  );
  const [active, setActive] = useState<Item | null>(null);
  const [dest, setDestCluster] = useState<ProcessedCluster | null>(null);
  const [sourceList, setSourceList] = useState<Item[]>([]);
  const [destList, setDestList] = useState<Item[]>([]);

  const taxonomy = useSelector(selectDocumentTaxonomy);

  useEffect(() => {
    if (sourceCluster && dest) {
      const sourceItems: Item[] = sourceCluster.mentions.map(
        (mention) =>
          ({
            content: mention.mention,
            id: mention.id.toString(),
          } as Item)
      );
      console.log(sourceItems);
      const destItems: Item[] = dest.mentions.map(
        (mention) =>
          ({
            content: mention.mention,
            id: mention.id.toString(),
          } as Item)
      );
      setSourceList(sourceItems);
      console.log(destItems);
      setDestList(destItems);
    }
  }, [sourceCluster, dest]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    console.log(active, over);
    if (!over) return;

    const activeList = sourceList.find((item) => item.id === active.id)
      ? 'sourceList'
      : 'destList';
    let overList = '';
    if (activeList == 'sourceList') {
      overList = 'destList';
    } else {
      overList = 'sourceList';
    }

    console.log(activeList, overList);
    if (activeList === overList) {
      // Moving within the same list
      if (active.id !== over.id) {
        const list = activeList === 'sourceList' ? sourceList : destList;
        const setList =
          activeList === 'sourceList' ? setSourceList : setDestList;

        const oldIndex = list.findIndex((item) => item.id === active.id);
        const newIndex = list.findIndex((item) => item.id === over.id);

        setList(arrayMove(list, oldIndex, newIndex));
      }
    } else {
      // Moving item between lists
      const source = activeList === 'sourceList' ? sourceList : destList;
      const setSource =
        activeList === 'sourceList' ? setSourceList : setDestList;
      const destinationList = overList === 'sourceList' ? sourceList : destList;
      const setDestinationList =
        overList === 'sourceList' ? setSourceList : setDestList;

      const moved = source.find((item) => item.id === active.id);
      if (moved) {
        // Remove item from the source list
        setSource(source.filter((item) => item.id !== active.id));

        // Add item to the destination list
        setDestinationList([...destinationList, moved]);
      }
    }
    setActive(null);
  };
  const handleDragStart = (event: DragStartEvent) => {
    const activeList = sourceList.find((item) => item.id === event.active.id)
      ? 'sourceList'
      : 'destList';
    const list = activeList === 'sourceList' ? sourceList : destList;
    const item = list.find((item) => item.id === event.active.id);
    if (item) setActive(item);
    else setActive(null);
  };

  return (
    <>
      <Button onPress={() => setIsOpen(true)}>Open Modal</Button>
      <Modal
        title="Modifica cluster"
        open={isOpen}
        onOk={() => setIsOpen(false)}
        onCancel={() => setIsOpen(false)}
      >
        <Row justify="space-between" align="middle">
          <Col span={12}>
            <p>Cluster sorgente</p>
            <Select
              style={{ width: '90%' }}
              placeholder="Seleziona un cluster"
              onChange={(value) => {
                let source = null;
                Object.keys(clusterGroups).forEach((groupKey) => {
                  let group = clusterGroups[groupKey];
                  group.forEach((cluster) => {
                    if (cluster.id === value) {
                      source = cluster;
                    }
                  });
                });
                setSourceCluster(source);
              }}
              options={Object.keys(clusterGroups).map((groupKey) => ({
                label: (
                  <span>
                    <Tag
                      color={
                        getAllNodeData(
                          taxonomy,
                          clusterGroups[groupKey][0].type
                        ).color
                      }
                    >
                      <span>{groupKey}</span>
                    </Tag>
                  </span>
                ),
                value: groupKey,
                options: clusterGroups[groupKey].map((cluster) => ({
                  label: cluster.title,
                  value: cluster.id,
                })),
              }))}
            ></Select>
          </Col>
          <Col span={12}>
            <p>Cluster destinazione</p>
            <Select
              style={{ width: '90%' }}
              placeholder="Seleziona un cluster"
              onChange={(value) => {
                let dest = null;
                Object.keys(clusterGroups).forEach((groupKey) => {
                  let group = clusterGroups[groupKey];
                  group.forEach((cluster) => {
                    if (cluster.id === value) {
                      dest = cluster;
                    }
                  });
                });
                setDestCluster(dest);
              }}
              options={Object.keys(clusterGroups).map((groupKey) => ({
                label: (
                  <span>
                    <Tag
                      color={
                        getAllNodeData(
                          taxonomy,
                          clusterGroups[groupKey][0].type
                        ).color
                      }
                    >
                      <span>{groupKey}</span>
                    </Tag>
                  </span>
                ),
                value: groupKey,
                options: clusterGroups[groupKey].map((cluster) => ({
                  label: cluster.title,
                  value: cluster.id,
                })),
              }))}
            ></Select>
          </Col>
        </Row>
        <Row style={{ width: '100%' }}>
          {(sourceList.length > 0 || destList.length > 0) && (
            <DndContext
              onDragStart={handleDragStart}
              collisionDetection={closestCorners}
              onDragEnd={handleDragEnd}
            >
              <Row
                justify={'space-between'}
                style={{ width: '100%', padding: 10 }}
                gutter={20}
              >
                <Col
                  span={11}
                  style={{
                    backgroundColor: '#e8e8e8',

                    borderRadius: 20,
                    padding: 15,
                  }}
                >
                  <SortableContext
                    items={sourceList}
                    strategy={rectSortingStrategy}
                  >
                    {sourceList.map((item) => {
                      return (
                        <SortableItem
                          key={`${item.id}`}
                          id={`${item.id}`}
                          name={item.content}
                        />
                      );
                    })}
                  </SortableContext>
                </Col>
                <Col
                  span={11}
                  style={{
                    backgroundColor: '#e8e8e8',

                    borderRadius: 20,
                    padding: 15,
                  }}
                >
                  <SortableContext
                    items={destList}
                    strategy={rectSortingStrategy}
                  >
                    {destList.map((item) => (
                      <SortableItem
                        key={`${item.id}`}
                        id={`${item.id}`}
                        name={item.content}
                        activeId={active ? active.id : undefined}
                      />
                    ))}
                  </SortableContext>
                </Col>
              </Row>
              <DragOverlay>
                {active ? (
                  <SortableItem
                    key={`${active.id}`}
                    id={`${active.id}`}
                    name={active.content}
                  />
                ) : null}
              </DragOverlay>
            </DndContext>
          )}
        </Row>
      </Modal>
    </>
  );
};

export default EditClusters;
