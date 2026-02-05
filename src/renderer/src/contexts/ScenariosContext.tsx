
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { Scenario } from '../types'

interface ScenariosContextType {
  scenarios: Scenario[]
  activeScenario: Scenario | null
  setActiveScenario: (scenario: Scenario | null) => void
  fetchScenarios: () => Promise<void>
  createScenario: (name: string, startDate: string, endDate: string, description?: string) => Promise<Scenario>
  deleteScenario: (id: string) => Promise<void>
  publishScenario: (id: string) => Promise<void>
  cloneLiveShifts: (scenarioId: string, startDate: string, endDate: string) => Promise<void>
}

const ScenariosContext = createContext<ScenariosContextType | undefined>(undefined)

export const ScenariosProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [scenarios, setScenarios] = useState<Scenario[]>([])
  const [activeScenario, setActiveScenario] = useState<Scenario | null>(null)

  const fetchScenarios = async () => {
    try {
      const result = await window.api.scenarios.getAll()
      setScenarios(result as Scenario[])
    } catch (error) {
      console.error('Failed to fetch scenarios:', error)
    }
  }

  const createScenario = async (name: string, startDate: string, endDate: string, description?: string) => {
    const newScenario = await window.api.scenarios.create(name, description, startDate, endDate)
    await fetchScenarios()
    return newScenario
  }

  const deleteScenario = async (id: string) => {
    await window.api.scenarios.delete(id)
    if (activeScenario?.id === id) {
      setActiveScenario(null)
    }
    await fetchScenarios()
  }

  const publishScenario = async (id: string) => {
    await window.api.scenarios.publish(id)
    if (activeScenario?.id === id) {
      setActiveScenario(null)
    }
    await fetchScenarios()
  }

  const cloneLiveShifts = async (scenarioId: string, startDate: string, endDate: string) => {
    await window.api.scenarios.cloneLiveShifts(scenarioId, startDate, endDate)
  }

  useEffect(() => {
    fetchScenarios()
  }, [])

  return (
    <ScenariosContext.Provider
      value={{
        scenarios,
        activeScenario,
        setActiveScenario,
        fetchScenarios,
        createScenario,
        deleteScenario,
        publishScenario,
        cloneLiveShifts
      }}
    >
      {children}
    </ScenariosContext.Provider>
  )
}

export const useScenarios = () => {
  const context = useContext(ScenariosContext)
  if (context === undefined) {
    throw new Error('useScenarios must be used within a ScenariosProvider')
  }
  return context
}
