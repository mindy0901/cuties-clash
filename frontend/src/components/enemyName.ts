import { translate } from '../i18n'

export function translateEnemyName(name: string) {
	const bossPrefix = 'Thủ Lĩnh · '
	const boss = name.startsWith(bossPrefix)
	const baseName = boss ? name.slice(bossPrefix.length) : name
	const typePrefix = ['Quái vật · ', 'Ác linh · ', 'Zombie · '].find((prefix) => baseName.startsWith(prefix))
	const enemyName = typePrefix
		? `${translate(typePrefix)}${translate(baseName.slice(typePrefix.length))}`
		: translate(baseName)
	return boss ? `${translate(bossPrefix)}${enemyName}` : enemyName
}
