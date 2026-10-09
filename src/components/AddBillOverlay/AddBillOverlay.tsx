import { useFriends } from '../../hooks/useFriends'
import { useGroups } from '../../hooks/useGroups'
import { useTags } from '../../hooks/useTags'
import BillSheet from '../SplitDetail/BillSheet'

interface AddBillOverlayProps {
  show: boolean
  onClose: () => void
  onCreated: () => void
}

export default function AddBillOverlay({ show, onClose, onCreated }: AddBillOverlayProps) {
  const { friends } = useFriends()
  const { groups } = useGroups()
  const { tags } = useTags()

  if (!show) return null

  return (
    <BillSheet
      friends={friends}
      groups={groups}
      tags={tags}
      onClose={onClose}
      onSaved={() => {
        onClose()
        onCreated()
      }}
    />
  )
}
