import ExtendWorkflow from './ExtendWorkflow'

export default async function ExtendPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <ExtendWorkflow id={id} />
}
