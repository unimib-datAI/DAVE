import React, { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { ArrowLeftRight } from 'lucide-react';
import { ProcessedCluster } from '../DocumentProvider/types';
import { Button, Tooltip } from '@heroui/react';
import { Checkbox, Col, Drawer, message, Modal, Row, Select, Tag } from 'antd';
import {
  selectCurrentAnnotationSetName,
  selectDocumentId,
  selectDocumentTaxonomy,
  useSelector,
  useDocumentContext,
} from '../DocumentProvider/selectors';
import { getAllNodeData } from '@/components/Tree';
import {
  DndContext,
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
import { useMutation } from '@/utils/trpc';

import { getClustersGroups, groupBy } from '@/utils/shared';
import { CheckboxChangeEvent } from 'antd/es/checkbox';
import { useText } from '@/components';
import { useDocumentPermissions } from '@/hooks';

interface EditClustersProps {
  onEdit: Function;
  clusterGroups: {
    [key: string]: ProcessedCluster[];
  };
}
interface Item {
  id: string;
  content: string;
  fullText: string;
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
  mentionText: string;
  activeItems: Item[];
  selectedItems: Set<string>;
  onCheckboxChange: (id: string) => void;
}

const SortableItem: React.FC<SortableItemProps> = ({
  id,
  name,
  mentionText,
  selectedItems,
  onCheckboxChange,
}) => {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id });
  const startIndex = mentionText.indexOf(name);
  const endIndex = startIndex + name.length - 1;
  const isSelected = selectedItems.has(id.toString());
  const handleCheckboxChange = (event: CheckboxChangeEvent) => {
    event.stopPropagation();
    onCheckboxChange(id.toString());
  };
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? undefined,
    padding: '8px 12px',
    border: isSelected ? '1.5px solid #6366f1' : '1px solid #e5e7eb',
    borderRadius: 8,
    marginBottom: '6px',
    backgroundColor: isSelected ? '#eef2ff' : 'white',
    cursor: 'grab',
    zIndex: transform ? 1 : 'auto',
    boxShadow: isSelected ? '0 0 0 2px #c7d2fe' : '0 1px 2px rgba(0,0,0,0.04)',
    userSelect: 'none',
  };
  const customListeners = {
    ...listeners,
    onPointerDown: (event: React.PointerEvent) => {
      if ((event.target as HTMLElement).tagName !== 'INPUT') {
        if (listeners) listeners.onPointerDown?.(event);
      }
    },
    onClick: (event: React.MouseEvent) => {
      if ((event.target as HTMLElement).tagName !== 'INPUT') {
        if (listeners) listeners.onClick?.(event);
      }
    },
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...customListeners}>
      <Row gutter={10} align="middle" wrap={false}>
        <Col flex="none">
          <Checkbox
            style={{ zIndex: 10 }}
            checked={isSelected}
            onChange={handleCheckboxChange}
          />
        </Col>
        <Col flex="auto" style={{ minWidth: 0 }}>
          <span style={{ fontSize: 13, color: '#374151', lineHeight: 1.5 }}>
            {mentionText.slice(0, startIndex)}
            <span
              style={{
                backgroundColor: '#fef08a',
                borderRadius: 4,
                padding: '1px 4px',
                fontWeight: 600,
                color: '#1e293b',
              }}
            >
              {name}
            </span>
            {mentionText.slice(endIndex + 1)}
          </span>
        </Col>
        <Col flex="none">
          <span style={{ color: '#d1d5db', fontSize: 16, cursor: 'grab' }}>
            ⠿
          </span>
        </Col>
      </Row>
    </div>
  );
};
const dragAndDropColStyle: React.CSSProperties = {
  backgroundColor: '#f8fafc',
  borderRadius: 10,
  padding: '12px 10px',
  border: '1px solid #e2e8f0',
  minHeight: 120,
};
const EditClusters = ({ clusterGroups, onEdit }: EditClustersProps) => {
  const [isOpen, setIsOpen] = useState(false); //modal open closed state
  const [isSaving, setIsSaving] = useState(false); //loading state for save button
  const [sourceCluster, setSourceCluster] = useState<ProcessedCluster | null>(
    null
  ); //selected source cluster
  const [active, setActive] = useState<Item[]>([]); //list containing active items for drag and drop
  const [dest, setDestCluster] = useState<ProcessedCluster | null>(null); //cluster selected to recieve entities
  const [sourceList, setSourceList] = useState<Item[]>([]); //list used to populate the source column
  const [destList, setDestList] = useState<Item[]>([]); //list used to populate the destination column
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set()); //list of selected items
  const [movedEntities, setMovedEntities] = useState<Number[]>([]); //list of moved entities, passed to the api
  const [editedClusters, setEditedClusters] = useState<boolean>(false); //flag to check if clusters have been edited
  const taxonomy = useSelector(selectDocumentTaxonomy); //taxonomy of the document
  const docId = useSelector(selectDocumentId);
  const annSetName = useSelector(selectCurrentAnnotationSetName);
  const context = useDocumentContext();
  const { data: session } = useSession();
  const token = (session as any)?.accessToken as string | undefined;
  const moveEntitiesToClusters = useMutation([
    'document.moveEntitiesToCluster',
  ]);
  const t = useText('document');
  const { canUpdate } = useDocumentPermissions();

  useEffect(() => {
    if (sourceCluster && dest) {
      const sourceItems: Item[] = sourceCluster.mentions.map(
        (mention) =>
          ({
            content: mention.mention,
            // @ts-ignore
            fullText: mention.mentionText,
            id: mention.id.toString(),
          } as Item)
      );
      const destItems: Item[] = dest.mentions.map(
        (mention) =>
          ({
            content: mention.mention,
            // @ts-ignore
            fullText: mention.mentionText,
            id: mention.id.toString(),
          } as Item)
      );
      setSourceList(sourceItems);
      setDestList(destItems);
    }
  }, [sourceCluster, dest]);

  function handleCheckboxChange(id: string) {
    setSelectedItems((prev) => {
      const newSelectedItems = new Set(prev);
      if (newSelectedItems.has(id)) {
        newSelectedItems.delete(id);
      } else {
        newSelectedItems.add(id);
      }
      return newSelectedItems;
    });
  }

  function handleSelectAll() {
    if (selectedItems.size === sourceList.length) {
      setSelectedItems(new Set());
    } else {
      const allIds = sourceList.map((item) => item.id);
      setSelectedItems(new Set(allIds));
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    console.log('dragend', active, over);
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

    if (activeList === overList) {
      // Moving within the same list
      if (active.id !== over.id) {
        const list = activeList === 'sourceList' ? sourceList : destList;
        const setList =
          activeList === 'sourceList' ? setSourceList : setDestList;

        // If multiple items are selected, move all selected items
        if (selectedItems.size > 0) {
          const selectedItemsArray = Array.from(selectedItems);
          const movedItems = selectedItemsArray.map((id) =>
            list.find((item) => item.id === id)
          );
          const oldIndex = movedItems.findIndex(
            (item) => item?.id === active.id
          );
          const newIndex = list.findIndex((item) => item.id === over.id);
          setList(arrayMove(list, oldIndex, newIndex));
        } else {
          const oldIndex = list.findIndex((item) => item.id === active.id);
          const newIndex = list.findIndex((item) => item.id === over.id);
          setList(arrayMove(list, oldIndex, newIndex));
        }
      }
    } else {
      // Moving item between lists
      const source = activeList === 'sourceList' ? sourceList : destList;
      const setSource =
        activeList === 'sourceList' ? setSourceList : setDestList;
      const destinationList = overList === 'sourceList' ? sourceList : destList;
      const setDestinationList =
        overList === 'sourceList' ? setSourceList : setDestList;
      // If multiple items are selected, move all selected items
      if (selectedItems.size > 0) {
        const selectedItemsArray = Array.from(selectedItems);
        const moved = source.filter((item) =>
          selectedItemsArray.includes(item.id)
        );

        if (selectedItemsArray) {
          setSource(
            source.filter((item) => !selectedItemsArray.includes(item.id))
          );
          setDestinationList([...destinationList, ...moved]);
          setMovedEntities((prev) => [
            ...prev,
            ...moved.map((item) => Number(item.id.valueOf())),
          ]);
        }
      } else {
        const moved = source.find((item) => item.id === active.id);
        if (moved) {
          // Remove item from the source list
          setSource(source.filter((item) => item.id !== active.id));

          // Add item to the destination list
          setDestinationList([...destinationList, moved]);
          setMovedEntities((prev) => [...prev, Number(active.id.valueOf())]);
        }
      }
    }

    setActive([]);
    setEditedClusters(true);
  }

  function handleDragStart(event: DragStartEvent) {
    const { active } = event;
    const activeList = sourceList.find((item) => item.id === active.id)
      ? 'sourceList'
      : 'destList';

    // If multiple items are selected, set them as active
    if (selectedItems.size > 0) {
      const list = activeList === 'sourceList' ? sourceList : destList;
      const selectedItemsArray = Array.from(selectedItems);
      const activeItems = selectedItemsArray
        .map((id) => list.find((item) => item.id === id))
        .filter((item) => item !== undefined);
      // @ts-ignore
      setActive(activeItems);
    } else {
      const list = activeList === 'sourceList' ? sourceList : destList;
      const item = list.find((item) => item.id === active.id);
      if (item) setActive([item]);
      else setActive([]);
    }
  }

  async function handleSave() {
    let success = false;
    setIsSaving(true);
    try {
      let updatedDoc = moveEntitiesToClusters.mutate(
        {
          id: docId,
          entities: Array.from(new Set(movedEntities)) as number[],
          sourceCluster: sourceCluster?.id as number,
          annotationSet: annSetName as string,
          destinationCluster: dest?.id as number,
          token,
        },
        {
          onSuccess: (data) => {
            if (annSetName) {
              let clusterGroups = getClustersGroups(data, annSetName);

              onEdit(clusterGroups);
              context.updateData(data);
              message.success('Clusters aggiornati con successo');
              success = true;
              // Close drawer only after successful save
              setIsOpen(false);
            }
          },
        }
      );
      // context?.updateData(updatedDoc);
    } catch (error) {
      console.error(error);
    } finally {
      setIsSaving(false);
      setSourceCluster(null);
      setDestCluster(null);
      setSourceList([]);
      setDestList([]);
      setSelectedItems(new Set());
      setMovedEntities([]);
      setEditedClusters(false);
      setActive([]);
    }
  }
  return (
    <>
      {canUpdate ? (
        <Button
          style={{ margin: 15, zIndex: 1 }}
          onPress={() => {
            console.log('setting is ope');
            setIsOpen(true);
          }}
        >
          {t('editClusters')}
        </Button>
      ) : (
        <Tooltip
          content={t('noUpdatePermission')}
          placement="top"
          color="foreground"
        >
          <span style={{ display: 'inline-block', margin: 15 }}>
            <Button isDisabled style={{ pointerEvents: 'none' }}>
              {t('editClusters')}
            </Button>
          </span>
        </Tooltip>
      )}
      <Drawer
        width={'72%'}
        title={
          <span style={{ fontSize: 16, fontWeight: 600, color: '#1e293b' }}>
            {t('modifyClusters')}
          </span>
        }
        open={isOpen}
        onClose={() => !isSaving && setIsOpen(false)}
        styles={{
          body: { padding: '20px 24px', backgroundColor: '#f8fafc' },
          header: {
            borderBottom: '1px solid #e2e8f0',
            backgroundColor: '#fff',
          },
        }}
      >
        {/* Cluster selectors */}
        <div
          style={{
            backgroundColor: '#fff',
            borderRadius: 12,
            padding: '16px 20px',
            marginBottom: 20,
            border: '1px solid #e2e8f0',
            boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
          }}
        >
          <Row
            justify="space-between"
            align="middle"
            gutter={0}
            style={{ alignItems: 'stretch' }}
          >
            <Col span={10}>
              <p
                style={{
                  margin: '0 0 6px',
                  fontWeight: 500,
                  fontSize: 13,
                  color: '#64748b',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                {t('sourceCluster')}
              </p>
              <Select
                style={{ width: '100%' }}
                placeholder={t('selectCluster')}
                value={sourceCluster?.id}
                showSearch
                filterOption={(input, option) =>
                  String(option?.label ?? '')
                    .toLowerCase()
                    .includes(input.toLowerCase())
                }
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
              />
            </Col>
            <Col
              span={4}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'flex-end',
                paddingBottom: 1,
              }}
            >
              <button
                onClick={() => {
                  if (sourceCluster) {
                    let temp: ProcessedCluster = { ...sourceCluster };
                    setSourceCluster(dest);
                    if (temp) setDestCluster(temp);
                  }
                }}
                title="Swap clusters"
                style={{
                  backgroundColor: '#6366f1',
                  border: 'none',
                  borderRadius: '50%',
                  width: 36,
                  height: 36,
                  padding: 0,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white',
                  boxShadow: '0 2px 6px rgba(99,102,241,0.35)',
                  flexShrink: 0,
                }}
              >
                <ArrowLeftRight size={16} strokeWidth={2.5} />
              </button>
            </Col>
            <Col span={10}>
              <p
                style={{
                  margin: '0 0 6px',
                  fontWeight: 500,
                  fontSize: 13,
                  color: '#64748b',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                {t('destinationCluster')}
              </p>
              <Select
                style={{ width: '100%' }}
                placeholder={t('selectCluster')}
                value={dest?.id}
                showSearch
                filterOption={(input, option) =>
                  String(option?.label ?? '')
                    .toLowerCase()
                    .includes(input.toLowerCase())
                }
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
              />
            </Col>
          </Row>
        </div>

        {/* Drag & drop area */}
        {(sourceList.length > 0 || destList.length > 0) && (
          <DndContext
            onDragStart={handleDragStart}
            collisionDetection={closestCorners}
            onDragEnd={handleDragEnd}
          >
            <Row
              justify={'space-between'}
              style={{ width: '100%' }}
              gutter={16}
            >
              <Col span={12} style={dragAndDropColStyle}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 10,
                  }}
                >
                  <span
                    style={{ fontWeight: 600, fontSize: 13, color: '#475569' }}
                  >
                    {sourceCluster?.title ?? t('sourceCluster')}
                    <span
                      style={{
                        marginLeft: 8,
                        backgroundColor: '#e0e7ff',
                        color: '#4338ca',
                        borderRadius: 12,
                        padding: '1px 8px',
                        fontSize: 11,
                      }}
                    >
                      {sourceList.length}
                    </span>
                  </span>
                  <Button
                    size="sm"
                    variant="flat"
                    color={'secondary'}
                    onPress={handleSelectAll}
                  >
                    {t('selectAll')}
                  </Button>
                </div>
                <div
                  style={{ maxHeight: 480, overflowY: 'auto', paddingRight: 4 }}
                >
                  <SortableContext
                    items={sourceList}
                    strategy={rectSortingStrategy}
                  >
                    {sourceList.map((item) => (
                      <SortableItem
                        key={item.id}
                        id={item.id}
                        name={item.content}
                        mentionText={item.fullText}
                        activeItems={active}
                        selectedItems={selectedItems}
                        onCheckboxChange={handleCheckboxChange}
                      />
                    ))}
                  </SortableContext>
                </div>
              </Col>
              <Col span={12} style={dragAndDropColStyle}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    marginBottom: 10,
                  }}
                >
                  <span
                    style={{ fontWeight: 600, fontSize: 13, color: '#475569' }}
                  >
                    {dest?.title ?? t('destinationCluster')}
                    <span
                      style={{
                        marginLeft: 8,
                        backgroundColor: '#dcfce7',
                        color: '#15803d',
                        borderRadius: 12,
                        padding: '1px 8px',
                        fontSize: 11,
                      }}
                    >
                      {destList.length}
                    </span>
                  </span>
                </div>
                <div
                  style={{ maxHeight: 480, overflowY: 'auto', paddingRight: 4 }}
                >
                  <SortableContext
                    items={destList}
                    strategy={rectSortingStrategy}
                  >
                    {destList.map((item) => (
                      <SortableItem
                        key={item.id}
                        id={item.id}
                        name={item.content}
                        mentionText={item.fullText}
                        activeItems={active}
                        selectedItems={selectedItems}
                        onCheckboxChange={handleCheckboxChange}
                      />
                    ))}
                  </SortableContext>
                </div>
              </Col>
            </Row>
            <DragOverlay>
              {active &&
                active.length > 0 &&
                active.map((activeItem) => (
                  <SortableItem
                    key={activeItem.id}
                    id={activeItem.id}
                    name={activeItem.content}
                    mentionText={activeItem.fullText}
                    activeItems={active}
                    selectedItems={selectedItems}
                    onCheckboxChange={handleCheckboxChange}
                  />
                ))}
            </DragOverlay>
          </DndContext>
        )}

        {editedClusters && (
          <div
            style={{
              marginTop: 20,
              display: 'flex',
              justifyContent: 'flex-end',
            }}
          >
            <Button
              color="primary"
              onPress={handleSave}
              isLoading={isSaving}
              style={{ minWidth: 120 }}
            >
              {t('save')}
            </Button>
          </div>
        )}
      </Drawer>
    </>
  );
};

export default EditClusters;
