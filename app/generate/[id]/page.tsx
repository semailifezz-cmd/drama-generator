import Progress from './progress'

export default async function GeneratePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <Progress id={id} />
}
